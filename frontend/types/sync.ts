/**
 * `POST /api/sync` contract (backend/API.md, section "Offline sync").
 * Record shape = table columns in camelCase, **without `userId`** — the
 * server takes the owner only from the JWT and ignores anything the client
 * sends in that field anyway.
 *
 * `updatedAt` is mandatory on every record: conflict resolution runs on it
 * (last-write-wins). `deletedAt !== null` is a tombstone — a deletion done
 * offline must reach the other device, so we never send DELETE.
 *
 * Changing any field here is a backend contract change (PROMPT.md §12),
 * not a refactor — the server-side counterpart is
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
  /** Day as `YYYY-MM-DD` — the entry's business key, not `id`. */
  measuredOn: string;
  weightKg: number;
  note: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Same structure in both directions (push and pull) — the client does not
 * map two different shapes. Field order **is** the application order:
 * foreign keys require the parent to exist first.
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

/** Table names in the batch — the key in `SyncPayload` and in `applied`/`rejected`. */
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

/** Any batch record — all have `id` and `updatedAt`, which is enough for LWW. */
export type SyncRecord =
  | ExerciseSync
  | RoutineSync
  | RoutineItemSync
  | WorkoutSync
  | WorkoutExerciseSync
  | SetSync
  | BodyWeightSync;

/** `since: null` on the first run = full pull. */
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
  /** Timestamp of the server transaction START — we save it as `since`. */
  serverTime: string;
  applied: Record<string, number>;
  /** Rejected records also come back in `changes` in server form — convergence without a second round. */
  rejected: SyncRejection[];
  changes: SyncPayload;
}
