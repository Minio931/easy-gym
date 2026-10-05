"use client";

import { useSyncExternalStore } from "react";

/**
 * "Recently used" in the add-exercise sheet.
 *
 * The source is `localStorage`, not an endpoint — the backend has no
 * `GET /api/exercises/recent`, and `GET /api/workouts` returns summaries
 * without exercise names, so reconstructing this list would cost N
 * workout-detail requests. A deliberate stage-4 compromise; in stage 5 this
 * is replaced by a Dexie query, which already holds the full history
 * locally.
 */

const STORAGE_KEY = "easy-gym.recent-exercises";
const MAX_ENTRIES = 8;

const listeners = new Set<() => void>();
let cached: string[] | undefined = undefined;

function read(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** The snapshot MUST be reference-stable, otherwise useSyncExternalStore loops the render. */
export function readRecentExerciseIds(): string[] {
  if (cached === undefined) {
    cached = read();
  }
  return cached;
}

const SERVER_SNAPSHOT: string[] = [];

function readServer(): string[] {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function rememberExercise(exerciseId: string): void {
  const next = [exerciseId, ...readRecentExerciseIds().filter((id) => id !== exerciseId)].slice(
    0,
    MAX_ENTRIES,
  );
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* no storage room must not block adding an exercise */
  }
  for (const listener of listeners) {
    listener();
  }
}

export function useRecentExerciseIds(): string[] {
  return useSyncExternalStore(subscribe, readRecentExerciseIds, readServer);
}
