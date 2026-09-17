"use client";

import { useSyncExternalStore } from "react";

/**
 * Czas przerwy per ćwiczenie i przełącznik dźwięku. Lokalnie, bo backend nie
 * ma endpointu preferencji (jest `/api/profile`, ale tylko z `displayName`),
 * a „ile odpoczywam na przysiadzie" to ustawienie urządzenia, nie dane treningowe.
 */

const STORAGE_KEY = "easy-gym.rest-preferences";

/** Rozgrzewki nie odpoczywa się dwóch minut (spec §5). */
export const WARMUP_REST_SECONDS = 60;

export const REST_PRESETS = [60, 90, 120, 180, 300] as const;

export interface RestPreferences {
  /** `exerciseId` → sekundy. Klucz katalogowy, nie `workoutExerciseId` —
   * ustawienie ma przeżyć następny trening. */
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
    /* brak miejsca w storage nie może zablokować treningu */
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
 * Efektywny czas przerwy. Seria rozgrzewkowa nigdy nie czeka dłużej niż
 * {@link WARMUP_REST_SECONDS} — nawet jeśli dla ćwiczenia ustawiono 5 minut,
 * bo te 5 minut dotyczy serii roboczych.
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
