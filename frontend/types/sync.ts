/**
 * Kontrakt `POST /api/sync` (backend/API.md, sekcja „Synchronizacja offline").
 * Kształt rekordu = kolumny tabeli w camelCase, **bez `userId`** — właściciela
 * serwer bierze wyłącznie z JWT i to, co przyśle klient, i tak ignoruje.
 *
 * `updatedAt` jest obowiązkowe w każdym rekordzie: po nim rozstrzyga się
 * konflikt (last-write-wins). `deletedAt !== null` to tombstone — skasowanie
 * offline musi dojechać na drugie urządzenie, więc nigdy nie wysyłamy DELETE.
 *
 * Zmiana któregokolwiek pola tutaj jest zmianą kontraktu z backendem
 * (PROMPT.md §12), nie refaktorem — odpowiednik po stronie serwera to
 * `sync/dto/SyncRecords.java`.
 */

import type { Equipment } from "@/types/api";

export interface ExerciseSync {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: Equipment;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RoutineSync {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RoutineItemSync {
  id: string;
  routineId: string;
  exerciseId: string;
  orderIndex: number;
  targetSets: number | null;
  targetReps: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface WorkoutSync {
  id: string;
  startedAt: string;
  endedAt: string | null;
  routineId: string | null;
  notes: string | null;
  isDeload: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface WorkoutExerciseSync {
  id: string;
  workoutId: string;
  exerciseId: string;
  orderIndex: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SetSync {
  id: string;
  workoutExerciseId: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  toFailure: boolean;
  assisted: boolean;
  completedAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BodyWeightSync {
  id: string;
  /** Dzień jako `YYYY-MM-DD` — klucz biznesowy wpisu, nie `id`. */
  measuredOn: string;
  weightKg: number;
  note: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Ta sama struktura w obie strony (push i pull) — klient nie mapuje dwóch
 * różnych kształtów. Kolejność pól **jest** kolejnością stosowania zmian:
 * klucze obce wymagają, żeby rodzic istniał wcześniej.
 */
export interface SyncPayload {
  exercises?: ExerciseSync[];
  routines?: RoutineSync[];
  routineItems?: RoutineItemSync[];
  workouts?: WorkoutSync[];
  workoutExercises?: WorkoutExerciseSync[];
  sets?: SetSync[];
  bodyWeights?: BodyWeightSync[];
}

/** Nazwy tabel w paczce — klucz w `SyncPayload` i w `applied`/`rejected`. */
export const SYNC_TABLES = [
  "exercises",
  "routines",
  "routineItems",
  "workouts",
  "workoutExercises",
  "sets",
  "bodyWeights",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

/** Dowolny rekord paczki — wszystkie mają `id` i `updatedAt`, i to wystarcza do LWW. */
export type SyncRecord =
  | ExerciseSync
  | RoutineSync
  | RoutineItemSync
  | WorkoutSync
  | WorkoutExerciseSync
  | SetSync
  | BodyWeightSync;

/** `since: null` przy pierwszym uruchomieniu = pełny zaciąg. */
export interface SyncRequest {
  since: string | null;
  changes: SyncPayload;
}

export interface SyncRejection {
  table: string;
  id: string;
  reason: string;
}

export interface SyncResponse {
  /** Znacznik POCZĄTKU transakcji serwera — zapisujemy go jako `since`. */
  serverTime: string;
  applied: Record<string, number>;
  /** Odrzucone wracają też w `changes` w wersji serwerowej — zbieżność bez drugiej rundy. */
  rejected: SyncRejection[];
  changes: SyncPayload;
}
