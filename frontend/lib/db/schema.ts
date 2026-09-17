import Dexie, { type Table } from "dexie";
import type {
  BodyWeightSync,
  ExerciseSync,
  RoutineItemSync,
  RoutineSync,
  SetSync,
  WorkoutExerciseSync,
  WorkoutSync,
} from "@/types/sync";

/**
 * Lokalna baza (IndexedDB przez Dexie). Tabele są 1:1 odbiciem rekordów paczki
 * `POST /api/sync` — dzięki temu wypchnięcie zmiany to odczyt wiersza, a nie
 * tłumaczenie jednego kształtu na drugi w obie strony.
 *
 * Dwie decyzje, z których wynika reszta:
 *
 * 1. **Jedna baza na konto** (`easy-gym.<userId>`), nie wspólna z kolumną
 *    `userId`. Backend pilnuje izolacji filtrem w serwisie i wymusza na to test
 *    przy każdym endpoincie, bo zapomniany filtr to realny błąd. Tutaj tej
 *    pomyłki nie da się popełnić: cudzych danych po prostu nie ma w tej bazie,
 *    a wylogowanie kasuje ją w całości (PROMPT §2 — cudzy trening nie może
 *    zostać na urządzeniu).
 *
 * 2. **`dirty` zamiast osobnego dziennika operacji.** Wiersz z `dirty = 1` to
 *    zmiana, która nie dojechała na serwer. Serwer rozstrzyga konflikty
 *    last-write-wins na CAŁYCH rekordach, więc odtwarzanie dziennika operacji
 *    nie dałoby nic poza ryzykiem kolejności, a ponowienie wysyłki tego samego
 *    wiersza jest z natury idempotentne.
 */

/**
 * `0 | 1`, nie `boolean` — IndexedDB nie indeksuje wartości logicznych, więc
 * `where("dirty").equals(true)` nigdy nic nie zwraca i to cichy błąd, nie wyjątek.
 */
export type DirtyFlag = 0 | 1;

export const CLEAN: DirtyFlag = 0;
export const DIRTY: DirtyFlag = 1;

/** Rekord serwera + znacznik „czeka na wysłanie". */
export type Local<T> = T & { dirty: DirtyFlag };

export type LocalExercise = Local<ExerciseSync>;
export type LocalRoutine = Local<RoutineSync>;
export type LocalRoutineItem = Local<RoutineItemSync>;
export type LocalWorkout = Local<WorkoutSync>;
export type LocalWorkoutExercise = Local<WorkoutExerciseSync>;
export type LocalSet = Local<SetSync>;
export type LocalBodyWeight = Local<BodyWeightSync>;

/** Księgowość synchronizacji. Trzymana w bazie, nie w localStorage, żeby
 *  `since` i dane, których dotyczy, ginęły i wracały razem. */
export interface MetaRow {
  key: string;
  value: string | null;
}

export const META_SINCE = "sync.since";
export const META_LAST_SYNC_AT = "sync.lastSyncAt";

export class EasyGymDatabase extends Dexie {
  exercises!: Table<LocalExercise, string>;
  routines!: Table<LocalRoutine, string>;
  routineItems!: Table<LocalRoutineItem, string>;
  workouts!: Table<LocalWorkout, string>;
  workoutExercises!: Table<LocalWorkoutExercise, string>;
  sets!: Table<LocalSet, string>;
  bodyWeights!: Table<LocalBodyWeight, string>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    // Indeksy dobrane pod realne zapytania: `dirty` (co wypchnąć), klucz obcy
    // (złóż trening z kawałków) i `startedAt`/`measuredOn` (historia, wykresy).
    this.version(1).stores({
      exercises: "id, dirty, name, muscleGroup",
      routines: "id, dirty",
      routineItems: "id, dirty, routineId",
      workouts: "id, dirty, startedAt, endedAt",
      workoutExercises: "id, dirty, workoutId",
      sets: "id, dirty, workoutExerciseId",
      bodyWeights: "id, dirty, measuredOn",
      meta: "key",
    });
  }
}

export function databaseName(userId: string): string {
  return `easy-gym.${userId}`;
}
