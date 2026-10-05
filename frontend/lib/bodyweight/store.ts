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
 * SINGLE PLACE THAT WRITES BODY WEIGHT.
 *
 * Same path as workouts (stage 5): first Dexie with `dirty = 1`, then
 * the API. Weight is entered in the morning at home, but also in the
 * locker room — no signal cannot mean "type it in later".
 *
 * Statistics (weekly averages, rolling, trend) are computed by the SERVER
 * when there is a network. Offline they are computed by `computeLocalStats`
 * from the same rules (`lib/metrics.ts` mirrors the backend), so the screen
 * has one data shape and one render path, regardless of signal.
 * ================================================================== */

export interface BodyWeightState {
  status: "idle" | "loading" | "ready";
  stats: BodyWeightStatsResponse | null;
  /** `true` when the numbers come from Dexie, not the server — the screen signals this. */
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

/** Server snapshot — stable reference, otherwise hydration reports a mismatch. */
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
 * Read
 * ------------------------------------------------------------------ */

/** Recomputes the screen from the local DB. Used after every write and when offline. */
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

  // Local first: the screen is complete right away, even without signal.
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
      // No network is a normal state — we stay with Dexie numbers and
      // say so explicitly instead of showing an error.
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
 * Write
 * ------------------------------------------------------------------ */

/**
 * Save weight for a given day. Upsert by date — a second entry on the same
 * day EDITS the first, on both sides: locally and on the server.
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
    // Dexie BEFORE the network. Returns the `id` of an existing entry on
    // this day if there was one — so we send the server the same `id`, not
    // a second record for the day.
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
      // The entry sits in Dexie and will ship with sync. From the user's
      // perspective the save SUCCEEDED — because it did, it just has not
      // arrived yet.
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
