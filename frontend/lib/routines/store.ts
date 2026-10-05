"use client";

import { useSyncExternalStore } from "react";
import { createRoutine, deleteRoutine, listRoutines, updateRoutine } from "@/lib/api/routines";
import { OfflineError, isAbortError, messageForUser } from "@/lib/api/errors";
import { getDatabase } from "@/lib/db/database";
import {
  cacheServerRoutines,
  markRoutineDeleted,
  readRoutines,
  saveRoutineLocally,
  saveServerRoutine,
} from "@/lib/db/routine-repository";
import { toSaveRequest, type RoutineDraft } from "@/lib/routines/draft";
import { refreshPending, requestSync } from "@/lib/sync/engine";
import { uuid } from "@/lib/workout/uuid";
import type { RoutineResponse } from "@/types/api";

/* ================================================================== *
 * SINGLE PLACE THAT WRITES THE TEMPLATE.
 *
 * The same path as workouts and body weight (stage 5): first Dexie with
 * `dirty = 1`, then the API. A template is built at home, but tweaked in
 * the locker room ("today no deadlift") — no signal cannot mean "remember
 * that and type it in later".
 *
 * The template `id` and item `id` come from the CLIENT. The server honors
 * supplied `id` (`RoutineService.create`), so a record saved offline and
 * the same record sent after signal returns is one row, not two.
 * ================================================================== */

export interface RoutinesState {
  status: "idle" | "loading" | "ready";
  routines: RoutineResponse[];
  /** `true` when the list comes from Dexie, not from the server. */
  local: boolean;
  saving: boolean;
  error: string | null;
}

const INITIAL: RoutinesState = {
  status: "idle",
  routines: [],
  local: false,
  saving: false,
  error: null,
};

let state: RoutinesState = INITIAL;
const listeners = new Set<() => void>();

function setState(patch: Partial<RoutinesState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeToRoutines(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRoutinesState(): RoutinesState {
  return state;
}

/** Server snapshot — stable reference, otherwise hydration reports a mismatch. */
function getServerRoutinesState(): RoutinesState {
  return INITIAL;
}

export function useRoutinesState(): RoutinesState {
  return useSyncExternalStore(subscribeToRoutines, getRoutinesState, getServerRoutinesState);
}

/* ------------------------------------------------------------------ *
 * Read
 * ------------------------------------------------------------------ */

async function refreshFromLocal(local: boolean): Promise<void> {
  const db = getDatabase();
  if (db === null) {
    return;
  }
  setState({ status: "ready", routines: await readRoutines(db), local });
}

let loadToken = 0;

export async function loadRoutines(): Promise<void> {
  const token = (loadToken += 1);
  if (state.status === "idle") {
    setState({ status: "loading" });
  }

  // Dexie first: the list is complete right away, even without signal.
  // Until the templates stage the list read from the network only, so at
  // the gym without signal a template could not be launched, even though
  // the records were already on the device.
  await refreshFromLocal(true).catch(() => undefined);
  if (token !== loadToken) {
    return;
  }

  try {
    const routines = await listRoutines();
    if (token !== loadToken) {
      return;
    }
    setState({ status: "ready", routines, local: false, error: null });
    const db = getDatabase();
    if (db !== null) {
      await cacheServerRoutines(db, routines).catch(() => undefined);
    }
  } catch (cause) {
    if (token !== loadToken || isAbortError(cause)) {
      return;
    }
    if (cause instanceof OfflineError) {
      setState({ status: "ready", local: true, error: null });
      return;
    }
    setState({ status: "ready", error: messageForUser(cause) });
  }
}

/* ------------------------------------------------------------------ *
 * Write
 * ------------------------------------------------------------------ */

/** Returns the `id` of the saved template, or `null` if the save failed. */
export async function saveRoutine(draft: RoutineDraft): Promise<string | null> {
  setState({ saving: true, error: null });

  const isNew = draft.id === null;
  const id = draft.id ?? uuid();
  const now = new Date().toISOString();
  const withIds: RoutineDraft = {
    ...draft,
    id,
    items: draft.items.map((item) => ({ ...item, id: item.id ?? uuid() })),
  };
  const request = toSaveRequest(withIds);
  const db = getDatabase();

  if (db !== null) {
    await saveRoutineLocally(db, {
      id,
      name: request.name,
      notes: request.notes ?? null,
      items: request.items.map((item, index) => ({
        // `toSaveRequest` drops a new item's `id` on purpose (the server
        // does not require it), but the local row must have it — taken
        // from `withIds`.
        id: withIds.items[index].id ?? uuid(),
        routineId: id,
        exerciseId: item.exerciseId,
        orderIndex: item.orderIndex,
        targetSets: item.targetSets ?? null,
        targetReps: item.targetReps ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).catch(() => undefined);
    await refreshFromLocal(true).catch(() => undefined);
    void refreshPending();
  }

  try {
    const server = isNew ? await createRoutine(request) : await updateRoutine(id, request);
    if (db !== null) {
      await saveServerRoutine(db, server).catch(() => undefined);
      void refreshPending();
    }
    await loadRoutines();
    setState({ saving: false });
    return server.id;
  } catch (cause) {
    setState({ saving: false });
    if (cause instanceof OfflineError) {
      // The template sits in Dexie and will ship with sync. From the user's
      // perspective the save SUCCEEDED — because it did, it just has not
      // arrived yet.
      void requestSync();
      return id;
    }
    setState({ error: messageForUser(cause) });
    return null;
  }
}

export async function removeRoutine(id: string): Promise<boolean> {
  const db = getDatabase();
  const now = new Date().toISOString();
  if (db !== null) {
    await markRoutineDeleted(db, id, now).catch(() => undefined);
    await refreshFromLocal(true).catch(() => undefined);
    void refreshPending();
  }

  try {
    await deleteRoutine(id);
    await loadRoutines();
    return true;
  } catch (cause) {
    if (cause instanceof OfflineError) {
      void requestSync();
      return true;
    }
    setState({ error: messageForUser(cause) });
    return false;
  }
}
