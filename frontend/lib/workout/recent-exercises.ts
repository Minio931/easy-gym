"use client";

import { useSyncExternalStore } from "react";

/**
 * „Ostatnio używane" w arkuszu dodawania ćwiczenia.
 *
 * Źródłem jest `localStorage`, nie endpoint — backend nie ma
 * `GET /api/exercises/recent`, a `GET /api/workouts` zwraca podsumowania bez
 * nazw ćwiczeń, więc zrekonstruowanie tej listy kosztowałoby N zapytań o
 * szczegóły treningów. Świadomy kompromis na etap 4; w etapie 5 zastąpi to
 * zapytanie do Dexie, które ma już całą historię lokalnie.
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

/** Migawka MUSI być stabilna referencyjnie, inaczej useSyncExternalStore pętli render. */
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
    /* brak miejsca w storage nie może zablokować dodania ćwiczenia */
  }
  for (const listener of listeners) {
    listener();
  }
}

export function useRecentExerciseIds(): string[] {
  return useSyncExternalStore(subscribe, readRecentExerciseIds, readServer);
}
