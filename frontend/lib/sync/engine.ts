"use client";

import type { Table } from "dexie";
import { postSync } from "@/lib/api/sync";
import { OfflineError } from "@/lib/api/errors";
import { getDatabase, readSince, writeSince } from "@/lib/db/database";
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
 * Silnik synchronizacji: zbierz brudne wiersze → wyślij → zastosuj odpowiedź.
 *
 * Wypychamy **całe rekordy**, nie dziennik operacji. Serwer rozstrzyga LWW na
 * całych rekordach, więc dziennik nie dałby nic poza ryzykiem kolejności, a
 * ponowienie wysyłki tego samego wiersza jest idempotentne — co przy sieci,
 * która znika w połowie żądania, jest całą różnicą.
 */

/* ------------------------------------------------------------------ *
 * Stan dla UI (pigułka synchronizacji)
 * ------------------------------------------------------------------ */

export interface SyncState {
  status: "idle" | "syncing" | "error";
  /** Ile wierszy czeka na wysłanie. 0 = wszystko na serwerze. */
  pending: number;
  lastSyncAt: string | null;
  /** Komunikat po polsku albo `null`. Brak sieci NIE jest tu błędem. */
  error: string | null;
  /**
   * Rekordy, których serwer nie przyjął w ostatniej rundzie. Zwykle to zwykłe
   * rozstrzygnięcie LWW (wygrała wersja z drugiego urządzenia) i nic się nie
   * stało -- ale odrzucenie nie ma prawa zniknąć bez śladu, bo to jedyny
   * moment, w którym lokalna zmiana przepada.
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

// Migawka musi być cache'owana w module: `useSyncExternalStore` porównuje ją
// referencyjnie i nowy obiekt przy każdym wywołaniu zapętla render
// (frontend/CLAUDE.md, pułapki Next 16).
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

/** Migawka serwerowa — stała referencja, inaczej hydracja zgłasza niezgodność. */
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
 * Zbieranie i stosowanie zmian
 * ------------------------------------------------------------------ */

/** Tabele w kolejności stosowania — klucze obce wymagają rodzica wcześniej. */
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

/** Rekord bez `dirty` — to znacznik wyłącznie lokalny, w paczce nie ma po nim pola. */
function withoutDirty(row: Local<SyncRecord>): SyncRecord {
  const { dirty, ...record } = row;
  void dirty;
  return record as SyncRecord;
}

/** Ile wierszy czeka na wysłanie — liczone po `dirty`, bez ładowania treści. */
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
  // `id -> updatedAt` wysłanej wersji. Po powrocie odpowiedzi czyścimy `dirty`
  // TYLKO tam, gdzie znacznik się nie zmienił — inaczej seria poprawiona w
  // trakcie lotu żądania zostałaby uznana za zapisaną i nigdy nie dojechała.
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
 * Stosuje odpowiedź serwera w jednej transakcji — albo cała paczka wchodzi,
 * albo żadna jej część. Paczka rozłożona na pół (serie bez ćwiczenia treningu)
 * dałaby ekran, którego nie da się naprawić inaczej niż czyszczeniem danych.
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

      // 1. Wersje z serwera. Odrzucone wracają tu w wersji serwerowej
      //    (API.md, reguła 5), więc nadpisanie ich lokalnie to cała obsługa
      //    odrzucenia — klient zbiega się bez dodatkowej rundy.
      for (const record of incomingFor(response.changes, name)) {
        const local = await table.get(record.id);
        if (!shouldAcceptIncoming(local, record)) {
          continue;
        }
        await table.put({ ...record, dirty: CLEAN });
        sent.delete(record.id);
      }

      // 2. Reszta wysłanych przestaje czekać w kolejce — niezależnie od tego,
      //    czy serwer je przyjął, czy odrzucił. Zostawienie `dirty` na rekordzie
      //    odrzuconym oznaczałoby wysyłanie w kółko wersji, którą serwer za
      //    każdym razem odrzuca.
      //
      //    Warunek na `updatedAt` jest tu istotny: jeśli user poprawił serię w
      //    trakcie lotu żądania, wiersz ma już nowszy znacznik i musi zostać
      //    brudny, żeby dojechać następną paczką.
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
 * Uruchamianie
 * ------------------------------------------------------------------ */

let running: Promise<void> | null = null;
let requestedAgain = false;

/**
 * Jedna synchronizacja naraz. Kolejne wywołanie w trakcie nie czeka w kolejce,
 * tylko podnosi flagę — po zakończeniu bieżącej rundy startuje jedna kolejna.
 * Dwie równoległe paczki wysyłałyby te same brudne wiersze dwa razy.
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
    // Brak sieci to stan normalny na siłowni, nie awaria (DESIGN §7.4).
    // Brudne wiersze zostają w Dexie i pojadą przy następnej okazji.
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

/** Odświeża sam licznik kolejki, bez ruszania sieci (po zapisie lokalnym). */
export async function refreshPending(): Promise<void> {
  const db = getDatabase();
  if (db === null) {
    return;
  }
  setState({ pending: await countPending(db) });
}

export function resetSyncState(): void {
  state = INITIAL;
  for (const listener of listeners) {
    listener();
  }
}
