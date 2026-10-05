"use client";

import type { Table } from "dexie";
import { postSync } from "@/lib/api/sync";
import { OfflineError } from "@/lib/api/errors";
import { dropDatabase, getDatabase, getDatabaseFor, readSince, writeSince } from "@/lib/db/database";
import { CLEAN, DIRTY, type EasyGymDatabase, type Local } from "@/lib/db/schema";
import { nextSince, shouldAcceptIncoming } from "@/lib/sync/merge";
import type {
  SyncPayload,
  SyncRecord,
  SyncRejection,
  SyncResponse,
  SyncTable,
} from "@/types/sync";

/**
 * Sync engine: gather dirty rows → send → apply the response.
 *
 * We push **whole records**, not an operation log. The server resolves LWW
 * on whole records, so a log would offer nothing but ordering risk, and
 * resending the same row is idempotent — which, on a network that disappears
 * mid-request, is the whole difference.
 */

/* ------------------------------------------------------------------ *
 * UI state (the sync pill)
 * ------------------------------------------------------------------ */

export interface SyncState {
  status: "idle" | "syncing" | "error";
  /** How many rows are waiting to be sent. 0 = everything on the server. */
  pending: number;
  lastSyncAt: string | null;
  /** Message in Polish or `null`. No network is NOT an error here. */
  error: string | null;
  /**
   * Records the server did not accept in the last round. Usually this is an
   * ordinary LWW outcome (the other device's version won) and nothing
   * happened — but a rejection must not disappear silently, because it is
   * the only moment at which a local change can be lost.
   */
  rejected: SyncRejection[];
}

const INITIAL: SyncState = {
  status: "idle",
  pending: 0,
  lastSyncAt: null,
  error: null,
  rejected: [],
};

// The snapshot must be cached in the module: `useSyncExternalStore` compares
// it by reference, and a new object on each call loops the render
// (frontend/CLAUDE.md, Next 16 pitfalls).
let state: SyncState = INITIAL;
const listeners = new Set<() => void>();

export function subscribeToSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncState(): SyncState {
  return state;
}

/** Server snapshot — stable reference, otherwise hydration reports a mismatch. */
export function getServerSyncState(): SyncState {
  return INITIAL;
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

/* ------------------------------------------------------------------ *
 * Collecting and applying changes
 * ------------------------------------------------------------------ */

/** Tables in application order — foreign keys require the parent first. */
function tablesOf(db: EasyGymDatabase): { name: SyncTable; table: Table<Local<SyncRecord>, string> }[] {
  return [
    { name: "exercises", table: db.exercises as Table<Local<SyncRecord>, string> },
    { name: "routines", table: db.routines as Table<Local<SyncRecord>, string> },
    { name: "routineItems", table: db.routineItems as Table<Local<SyncRecord>, string> },
    { name: "workouts", table: db.workouts as Table<Local<SyncRecord>, string> },
    { name: "workoutExercises", table: db.workoutExercises as Table<Local<SyncRecord>, string> },
    { name: "sets", table: db.sets as Table<Local<SyncRecord>, string> },
    { name: "bodyWeights", table: db.bodyWeights as Table<Local<SyncRecord>, string> },
  ];
}

/** Record without `dirty` — that flag is local only, the batch has no field for it. */
function withoutDirty(row: Local<SyncRecord>): SyncRecord {
  const { dirty, ...record } = row;
  void dirty;
  return record as SyncRecord;
}

/** How many rows are waiting to send — counted via `dirty`, without loading content. */
export async function countPending(db: EasyGymDatabase): Promise<number> {
  const counts = await Promise.all(
    tablesOf(db).map(({ table }) => table.where("dirty").equals(DIRTY).count()),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

async function collectChanges(
  db: EasyGymDatabase,
): Promise<{ payload: SyncPayload; pushed: Map<SyncTable, Map<string, string>> }> {
  const payload: SyncPayload = {};
  // `id -> updatedAt` of the version we sent. When the response comes back,
  // we clear `dirty` ONLY where the timestamp has not changed — otherwise a
  // set edited mid-flight would be considered saved and would never arrive.
  const pushed = new Map<SyncTable, Map<string, string>>();

  for (const { name, table } of tablesOf(db)) {
    const rows = await table.where("dirty").equals(DIRTY).toArray();
    if (rows.length === 0) {
      continue;
    }
    const records = rows.map(withoutDirty);
    Object.assign(payload, { [name]: records });
    pushed.set(name, new Map(records.map((record) => [record.id, record.updatedAt])));
  }

  return { payload, pushed };
}

function incomingFor(changes: SyncPayload, name: SyncTable): SyncRecord[] {
  const records: SyncRecord[] | undefined = changes[name];
  return records ?? [];
}

/**
 * Applies the server response in one transaction — either the whole batch
 * lands or none of it. A batch split in half (sets without a workout
 * exercise) would yield a screen that can only be fixed by clearing data.
 */
async function applyResponse(
  db: EasyGymDatabase,
  response: SyncResponse,
  pushed: Map<SyncTable, Map<string, string>>,
): Promise<void> {
  const entries = tablesOf(db);
  await db.transaction("rw", [...entries.map((entry) => entry.table), db.meta], async () => {
    for (const { name, table } of entries) {
      const sent = pushed.get(name) ?? new Map<string, string>();

      // 1. Server versions. Rejected ones come back here in the server's
      //    version (API.md, rule 5), so overwriting them locally is the
      //    whole rejection handling — the client converges with no extra round.
      for (const record of incomingFor(response.changes, name)) {
        const local = await table.get(record.id);
        if (!shouldAcceptIncoming(local, record)) {
          continue;
        }
        await table.put({ ...record, dirty: CLEAN });
        sent.delete(record.id);
      }

      // 2. The rest of what we sent stops waiting in the queue — regardless
      //    of whether the server accepted or rejected it. Leaving `dirty`
      //    on a rejected record would mean sending the same version over and
      //    over, which the server would reject each time.
      //
      //    The `updatedAt` guard matters here: if the user edited a set
      //    mid-flight, the row already has a newer timestamp and must stay
      //    dirty so it ships in the next batch.
      for (const [id, sentUpdatedAt] of sent) {
        const local = await table.get(id);
        if (local === undefined || local.updatedAt !== sentUpdatedAt) {
          continue;
        }
        await table.put({ ...local, dirty: CLEAN });
      }
    }

    await writeSince(db, nextSince(response.serverTime));
  });
}

/* ------------------------------------------------------------------ *
 * Running
 * ------------------------------------------------------------------ */

let running: Promise<void> | null = null;
let requestedAgain = false;

/**
 * One sync at a time. A call made during a running sync does not queue up,
 * it just raises a flag — when the current round finishes, one more starts.
 * Two parallel batches would send the same dirty rows twice.
 */
export function requestSync(): Promise<void> {
  if (running !== null) {
    requestedAgain = true;
    return running;
  }
  running = runOnce().finally(() => {
    running = null;
    if (requestedAgain) {
      requestedAgain = false;
      void requestSync();
    }
  });
  return running;
}

async function runOnce(): Promise<void> {
  const db = getDatabase();
  if (db === null) {
    return;
  }

  setState({ status: "syncing" });
  try {
    const { payload, pushed } = await collectChanges(db);
    const since = await readSince(db);
    const response = await postSync({ since, changes: payload });
    await applyResponse(db, response, pushed);
    setState({
      status: "idle",
      pending: await countPending(db),
      lastSyncAt: new Date().toISOString(),
      error: null,
      rejected: response.rejected,
    });
  } catch (error) {
    // No network is a normal state at the gym, not a failure (DESIGN §7.4).
    // Dirty rows stay in Dexie and ship at the next opportunity.
    if (error instanceof OfflineError) {
      setState({ status: "idle", pending: await countPending(db), error: null });
      return;
    }
    setState({
      status: "error",
      pending: await countPending(db),
      error: error instanceof Error ? error.message : "Nie udało się zsynchronizować",
    });
  }
}

/** Refreshes only the queue counter, without touching the network (after a local write). */
export async function refreshPending(): Promise<void> {
  const db = getDatabase();
  if (db === null) {
    return;
  }
  setState({ pending: await countPending(db) });
}

/**
 * Cleanup on logout.
 *
 * First try to push the pending queue, then drop the database — but **only
 * when the queue is empty**. Unconditional deletion would throw away a
 * workout done offline if the user logged out before signal returned; an
 * untouched database waits for them to log in again and then syncs through.
 *
 * The `localStorage` snapshot is cleared by `resetWorkoutStore()` separately —
 * it is what the next person sees immediately upon entering, the per-account
 * database is not.
 */
export async function releaseLocalData(userId: string): Promise<void> {
  const db = getDatabaseFor(userId);
  if (db === null) {
    return;
  }
  await requestSync().catch(() => undefined);
  const pending = await countPending(db).catch(() => 1);
  if (pending === 0) {
    await dropDatabase(userId);
  }
  resetSyncState();
}

export function resetSyncState(): void {
  state = INITIAL;
  for (const listener of listeners) {
    listener();
  }
}
