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
 * Local database (IndexedDB via Dexie). The tables are a 1:1 reflection of
 * the records in the `POST /api/sync` batch — this way pushing a change is
 * a row read, not translating one shape into another in both directions.
 *
 * Two decisions from which the rest follows:
 *
 * 1. **One database per account** (`easy-gym.<userId>`), not shared with a
 *    `userId` column. The backend enforces isolation with a filter in the
 *    service, and a test enforces it at every endpoint, because a forgotten
 *    filter is a real bug. Here the mistake cannot be made: someone else's
 *    data simply does not exist in this database, and logout wipes it
 *    entirely (PROMPT §2 — someone else's workout must not remain on the
 *    device).
 *
 * 2. **`dirty` instead of a separate operation log.** A row with `dirty = 1`
 *    is a change that has not reached the server. The server resolves
 *    conflicts last-write-wins on WHOLE records, so replaying an operation
 *    log would offer nothing but ordering risk, and resending the same row
 *    is idempotent by nature.
 */

/**
 * `0 | 1`, not `boolean` — IndexedDB does not index boolean values, so
 * `where("dirty").equals(true)` never returns anything, and that is a silent
 * bug, not an exception.
 */
export type DirtyFlag = 0 | 1;

export const CLEAN: DirtyFlag = 0;
export const DIRTY: DirtyFlag = 1;

/** Server record + a "waiting to be sent" marker. */
export type Local<T> = T & { dirty: DirtyFlag };

export type LocalExercise = Local<ExerciseSync>;
export type LocalRoutine = Local<RoutineSync>;
export type LocalRoutineItem = Local<RoutineItemSync>;
export type LocalWorkout = Local<WorkoutSync>;
export type LocalWorkoutExercise = Local<WorkoutExerciseSync>;
export type LocalSet = Local<SetSync>;
export type LocalBodyWeight = Local<BodyWeightSync>;

/** Sync bookkeeping. Kept in the database, not in localStorage, so that
 *  `since` and the data it describes disappear and come back together. */
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
    // Indexes chosen for actual queries: `dirty` (what to push), foreign key
    // (assemble a workout from pieces), and `startedAt`/`measuredOn`
    // (history, charts).
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
