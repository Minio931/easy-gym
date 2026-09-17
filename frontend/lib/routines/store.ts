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
 * JEDYNE MIEJSCE, KTÓRE ZAPISUJE SZABLON.
 *
 * Ta sama droga co przy treningu i wadze (etap 5): najpierw Dexie
 * z `dirty = 1`, potem API. Szablon układa się w domu, ale poprawia w szatni
 * („dziś bez martwego ciągu") — brak zasięgu nie może znaczyć „zapamiętaj to
 * sobie i wpisz później".
 *
 * `id` szablonu i pozycji nadaje KLIENT. Serwer honoruje podane `id`
 * (`RoutineService.create`), więc rekord zapisany offline i ten sam rekord
 * wysłany po powrocie sieci to jeden wiersz, a nie dwa.
 * ================================================================== */

export interface RoutinesState {
  status: "idle" | "loading" | "ready";
  routines: RoutineResponse[];
  /** `true` gdy lista pochodzi z Dexie, nie z serwera. */
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

/** Migawka serwerowa — stała referencja, inaczej hydracja zgłasza niezgodność. */
function getServerRoutinesState(): RoutinesState {
  return INITIAL;
}

export function useRoutinesState(): RoutinesState {
  return useSyncExternalStore(subscribeToRoutines, getRoutinesState, getServerRoutinesState);
}

/* ------------------------------------------------------------------ *
 * Odczyt
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

  // Najpierw Dexie: lista jest pełna od razu, także bez zasięgu. Do etapu
  // szablonów czytała wyłącznie z sieci, więc na siłowni bez zasięgu nie dało
  // się odpalić szablonu, mimo że rekordy leżały już na urządzeniu.
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
 * Zapis
 * ------------------------------------------------------------------ */

/** Zwraca `id` zapisanego szablonu albo `null`, gdy zapis się nie udał. */
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
        // `toSaveRequest` gubi `id` nowej pozycji celowo (serwer go nie wymaga),
        // ale lokalny wiersz musi je mieć — bierzemy je z `withIds`.
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
      // Szablon siedzi w Dexie i pojedzie synchronizacją. Z punktu widzenia
      // użytkownika zapis SIĘ UDAŁ — bo się udał, tylko jeszcze nie dojechał.
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
