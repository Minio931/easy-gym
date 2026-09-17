"use client";

import { useSyncExternalStore } from "react";
import { bodyWeightStats, deleteBodyWeight, saveBodyWeight } from "@/lib/api/body-weights";
import { OfflineError, isAbortError, messageForUser } from "@/lib/api/errors";
import { getDatabase } from "@/lib/db/database";
import {
  cacheServerBodyWeights,
  markBodyWeightDeleted,
  readBodyWeights,
  saveBodyWeightLocally,
  saveServerBodyWeight,
} from "@/lib/db/body-weight-repository";
import { computeLocalStats } from "@/lib/bodyweight/stats";
import { refreshPending, requestSync } from "@/lib/sync/engine";
import { uuid } from "@/lib/workout/uuid";
import type { BodyWeightStatsResponse } from "@/types/api";

/* ================================================================== *
 * JEDYNE MIEJSCE, KTÓRE ZAPISUJE WAGĘ.
 *
 * Ta sama droga co przy treningu (etap 5): najpierw Dexie z `dirty = 1`,
 * potem API. Wagę wpisuje się rano w domu, ale też w szatni — brak zasięgu
 * nie może oznaczać „wpisz to sobie później".
 *
 * Statystyki (średnie tygodniowe, krocząca, trend) liczy SERWER, gdy jest
 * sieć. Bez sieci liczy je `computeLocalStats` z tych samych reguł
 * (`lib/metrics.ts` jest mirrorem backendu), więc ekran ma jeden kształt
 * danych i jeden sposób renderowania, niezależnie od zasięgu.
 * ================================================================== */

export interface BodyWeightState {
  status: "idle" | "loading" | "ready";
  stats: BodyWeightStatsResponse | null;
  /** `true` gdy liczby pochodzą z Dexie, nie z serwera — ekran to sygnalizuje. */
  local: boolean;
  saving: boolean;
  error: string | null;
}

const EMPTY_STATS: BodyWeightStatsResponse = {
  entries: [],
  weekly: [],
  rollingSevenDay: [],
  latest: null,
  fourWeekTrend: null,
};

const INITIAL: BodyWeightState = {
  status: "idle",
  stats: null,
  local: false,
  saving: false,
  error: null,
};

let state: BodyWeightState = INITIAL;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<BodyWeightState>): void {
  state = { ...state, ...patch };
  notify();
}

export function subscribeToBodyWeight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBodyWeightState(): BodyWeightState {
  return state;
}

/** Migawka serwerowa — stała referencja, inaczej hydracja zgłasza niezgodność. */
export function getServerBodyWeightState(): BodyWeightState {
  return INITIAL;
}

export function useBodyWeightState(): BodyWeightState {
  return useSyncExternalStore(
    subscribeToBodyWeight,
    getBodyWeightState,
    getServerBodyWeightState,
  );
}

/* ------------------------------------------------------------------ *
 * Odczyt
 * ------------------------------------------------------------------ */

/** Przelicza ekran z lokalnej bazy. Używane po każdym zapisie i przy braku sieci. */
async function refreshFromLocal(local: boolean): Promise<void> {
  const db = getDatabase();
  if (db === null) {
    return;
  }
  const entries = await readBodyWeights(db);
  setState({ status: "ready", stats: computeLocalStats(entries), local });
}

let loadToken = 0;

export async function loadBodyWeights(): Promise<void> {
  const token = (loadToken += 1);
  if (state.stats === null) {
    setState({ status: "loading" });
  }

  // Najpierw lokalne: ekran jest pełny od razu, także bez zasięgu.
  await refreshFromLocal(true).catch(() => undefined);
  if (token !== loadToken) {
    return;
  }

  try {
    const stats = await bodyWeightStats();
    if (token !== loadToken) {
      return;
    }
    setState({ status: "ready", stats, local: false, error: null });

    const db = getDatabase();
    if (db !== null) {
      await cacheServerBodyWeights(db, stats.entries).catch(() => undefined);
    }
  } catch (cause) {
    if (token !== loadToken || isAbortError(cause)) {
      return;
    }
    if (cause instanceof OfflineError) {
      // Brak sieci to stan normalny — zostajemy przy liczbach z Dexie
      // i mówimy o tym wprost zamiast pokazywać błąd.
      setState({ status: "ready", error: null, local: true });
      return;
    }
    setState({ status: "ready", error: messageForUser(cause) });
  } finally {
    if (state.stats === null) {
      setState({ status: "ready", stats: EMPTY_STATS });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Zapis
 * ------------------------------------------------------------------ */

/**
 * Zapis wagi na dany dzień. Upsert po dacie — drugi wpis tego samego dnia
 * POPRAWIA pierwszy, po obu stronach: lokalnie i na serwerze.
 */
export async function saveWeight(
  measuredOn: string,
  weightKg: number,
  note: string | null = null,
): Promise<boolean> {
  setState({ saving: true, error: null });
  const now = new Date().toISOString();
  const db = getDatabase();

  let id = uuid();
  if (db !== null) {
    // Dexie PRZED siecią. Zwraca `id` istniejącego wpisu z tego dnia, jeśli był
    // — wysyłamy więc na serwer to samo `id`, a nie drugi rekord na ten dzień.
    const saved = await saveBodyWeightLocally(db, {
      id,
      measuredOn,
      weightKg,
      note,
      updatedAt: now,
    }).catch(() => null);
    if (saved !== null) {
      id = saved.id;
    }
    await refreshFromLocal(true).catch(() => undefined);
    void refreshPending();
  }

  try {
    const server = await saveBodyWeight({ id, measuredOn, weightKg, note });
    if (db !== null) {
      await saveServerBodyWeight(db, server).catch(() => undefined);
      void refreshPending();
    }
    await loadBodyWeights();
    setState({ saving: false });
    return true;
  } catch (cause) {
    setState({ saving: false });
    if (cause instanceof OfflineError) {
      // Wpis siedzi w Dexie i pojedzie synchronizacją. Z punktu widzenia
      // użytkownika zapis SIĘ UDAŁ — bo się udał, tylko jeszcze nie dojechał.
      void requestSync();
      return true;
    }
    setState({ error: messageForUser(cause) });
    return false;
  }
}

export async function removeWeight(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  if (db !== null) {
    await markBodyWeightDeleted(db, id, now).catch(() => undefined);
    await refreshFromLocal(true).catch(() => undefined);
    void refreshPending();
  }
  try {
    await deleteBodyWeight(id);
    await loadBodyWeights();
  } catch (cause) {
    if (cause instanceof OfflineError) {
      void requestSync();
      return;
    }
    setState({ error: messageForUser(cause) });
  }
}

export function resetBodyWeightStore(): void {
  state = INITIAL;
  loadToken += 1;
  notify();
}
