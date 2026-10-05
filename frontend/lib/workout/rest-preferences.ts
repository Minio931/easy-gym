"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-exercise rest time and the sound toggle. Local, because the backend
 * has no preferences endpoint (there is `/api/profile`, but only with
 * `displayName`), and "how long I rest on the squat" is a device setting,
 * not training data.
 */

const STORAGE_KEY = "easy-gym.rest-preferences";

/** A warmup set does not get a two-minute rest (spec §5). */
export const WARMUP_REST_SECONDS = 60;

export const REST_PRESETS = [60, 90, 120, 180, 300] as const;

export interface RestPreferences {
  /** `exerciseId` → seconds. Catalog key, not `workoutExerciseId` —
   * the setting must survive into the next workout. */
  perExercise: Record<string, number>;
  soundEnabled: boolean;
}

const DEFAULTS: RestPreferences = { perExercise: {}, soundEnabled: true };

const listeners = new Set<() => void>();
let cached: RestPreferences | undefined = undefined;

function parse(raw: string | null): RestPreferences {
  if (raw === null) {
    return DEFAULTS;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RestPreferences>;
    const perExercise: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed.perExercise ?? {})) {
      if (typeof value === "number" && value > 0 && value <= 3600) {
        perExercise[key] = Math.round(value);
      }
    }
    return {
      perExercise,
      soundEnabled: parsed.soundEnabled !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function readRestPreferences(): RestPreferences {
  if (cached === undefined) {
    cached = typeof window === "undefined" ? DEFAULTS : parse(window.localStorage.getItem(STORAGE_KEY));
  }
  return cached;
}

function readServer(): RestPreferences {
  return DEFAULTS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function write(next: RestPreferences): void {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* no storage room must not block the workout */
  }
  for (const listener of listeners) {
    listener();
  }
}

export function setRestSecondsFor(exerciseId: string, seconds: number): void {
  const current = readRestPreferences();
  write({ ...current, perExercise: { ...current.perExercise, [exerciseId]: seconds } });
}

export function setRestSoundEnabled(enabled: boolean): void {
  write({ ...readRestPreferences(), soundEnabled: enabled });
}

/**
 * Effective rest time. A warmup set never waits longer than
 * {@link WARMUP_REST_SECONDS} — even if the exercise is set to 5 minutes,
 * because those 5 minutes apply to working sets.
 */
export function restSecondsFor(
  preferences: RestPreferences,
  exerciseId: string,
  defaultRestSeconds: number,
  isWarmup: boolean,
): number {
  const base = preferences.perExercise[exerciseId] ?? defaultRestSeconds;
  return isWarmup ? Math.min(WARMUP_REST_SECONDS, base) : base;
}

export function useRestPreferences(): RestPreferences {
  return useSyncExternalStore(subscribe, readRestPreferences, readServer);
}
