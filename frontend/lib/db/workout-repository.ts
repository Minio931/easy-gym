import {
  CLEAN,
  DIRTY,
  type EasyGymDatabase,
  type LocalSet,
  type LocalWorkout,
  type LocalWorkoutExercise,
} from "@/lib/db/schema";
import { displayVolumeKg, prEligibleVolumeKg, estimate1RM, type OneRepMaxFormula } from "@/lib/metrics";
import type {
  Equipment,
  SetResponse,
  WorkoutDetailResponse,
  WorkoutExerciseResponse,
} from "@/types/api";

/**
 * The bridge between `WorkoutDetailResponse` (screen shape) and Dexie rows
 * (sync-batch shape). Decomposition one way, composition the other.
 *
 * Composition computes volumes and e1RM through `lib/metrics.ts` — the same
 * functions the optimistic patch uses, which mirror the backend. If this
 * computed them on its own, a workout resumed offline would show a
 * different volume than the same workout opened online.
 *
 * What composition does **not** reconstruct: `personalRecordsBrokenIn`.
 * A record depends on the full exercise history, which the local DB does
 * not have mid-session — same as the optimistic patch, the "PR" badge
 * lights up from the server response.
 */

/* ------------------------------------------------------------------ *
 * Write
 * ------------------------------------------------------------------ */

/**
 * Writes the workout as rows. `dirtyIds` are the ids of rows the user
 * changed and which should ship to the server; the rest **keep their
 * previous flag** — overwriting it with zero would wipe from the queue a
 * set still waiting to send.
 */
export async function persistWorkout(
  db: EasyGymDatabase,
  workout: WorkoutDetailResponse,
  dirtyIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const workoutRow: Omit<LocalWorkout, "dirty"> = {
    id: workout.id,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    routineId: workout.routineId,
    notes: workout.notes,
    isDeload: workout.isDeload,
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
    deletedAt: null,
  };

  const exerciseRows: Omit<LocalWorkoutExercise, "dirty">[] = workout.exercises.map((exercise) => ({
    id: exercise.id,
    workoutId: workout.id,
    exerciseId: exercise.exerciseId,
    orderIndex: exercise.orderIndex,
    notes: exercise.notes,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
    deletedAt: exercise.deletedAt,
  }));

  const setRows: Omit<LocalSet, "dirty">[] = workout.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      id: set.id,
      workoutExerciseId: exercise.id,
      setIndex: set.setIndex,
      weightKg: set.weightKg,
      reps: set.reps,
      rpe: set.rpe,
      isWarmup: set.isWarmup,
      toFailure: set.toFailure,
      assisted: set.assisted,
      completedAt: set.completedAt,
      updatedAt: set.updatedAt,
      deletedAt: set.deletedAt,
    })),
  );

  await db.transaction("rw", db.workouts, db.workoutExercises, db.sets, async () => {
    await putPreservingDirty(db.workouts, [workoutRow], dirtyIds);
    await putPreservingDirty(db.workoutExercises, exerciseRows, dirtyIds);
    await putPreservingDirty(db.sets, setRows, dirtyIds);
  });
}

interface DirtyAware {
  id: string;
  dirty: 0 | 1;
}

interface PutTable<T extends DirtyAware> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<string>;
}

async function putPreservingDirty<T extends DirtyAware>(
  table: PutTable<T>,
  rows: readonly Omit<T, "dirty">[],
  dirtyIds: ReadonlySet<string>,
): Promise<void> {
  for (const row of rows) {
    const existing = await table.get(row.id);
    const dirty = dirtyIds.has(row.id) ? DIRTY : (existing?.dirty ?? CLEAN);
    await table.put({ ...row, dirty } as T);
  }
}

/**
 * A workout confirmed by the server: all its rows are already on the
 * server, so they stop waiting in the queue. Rows absent from the response
 * (tombstones of deleted sets) are intentionally not touched — sync will
 * take care of them.
 */
export async function persistServerWorkout(
  db: EasyGymDatabase,
  workout: WorkoutDetailResponse,
): Promise<void> {
  await persistWorkout(db, workout, new Set());
  await db.transaction("rw", db.workouts, db.workoutExercises, db.sets, async () => {
    await clearDirty(db.workouts, [workout.id]);
    await clearDirty(
      db.workoutExercises,
      workout.exercises.map((exercise) => exercise.id),
    );
    await clearDirty(
      db.sets,
      workout.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id)),
    );
  });
}

async function clearDirty<T extends DirtyAware>(
  table: PutTable<T>,
  ids: readonly string[],
): Promise<void> {
  for (const id of ids) {
    const row = await table.get(id);
    if (row !== undefined && row.dirty === DIRTY) {
      await table.put({ ...row, dirty: CLEAN } as T);
    }
  }
}

/**
 * Tombstone, not `DELETE` — a deletion must reach the other device
 * (PROMPT §2). The cascade is explicit, because Dexie does not know
 * foreign keys.
 */
export async function markWorkoutDeleted(
  db: EasyGymDatabase,
  workoutId: string,
  now: string,
): Promise<void> {
  await db.transaction("rw", db.workouts, db.workoutExercises, db.sets, async () => {
    const workout = await db.workouts.get(workoutId);
    if (workout !== undefined) {
      await db.workouts.put({ ...workout, deletedAt: now, updatedAt: now, dirty: DIRTY });
    }
    const exercises = await db.workoutExercises.where("workoutId").equals(workoutId).toArray();
    for (const exercise of exercises) {
      await db.workoutExercises.put({ ...exercise, deletedAt: now, updatedAt: now, dirty: DIRTY });
      const sets = await db.sets.where("workoutExerciseId").equals(exercise.id).toArray();
      for (const set of sets) {
        await db.sets.put({ ...set, deletedAt: now, updatedAt: now, dirty: DIRTY });
      }
    }
  });
}

export async function markSetDeleted(
  db: EasyGymDatabase,
  setId: string,
  now: string,
): Promise<void> {
  const set = await db.sets.get(setId);
  if (set !== undefined) {
    await db.sets.put({ ...set, deletedAt: now, updatedAt: now, dirty: DIRTY });
  }
}

export async function markWorkoutExerciseDeleted(
  db: EasyGymDatabase,
  workoutExerciseId: string,
  now: string,
): Promise<void> {
  await db.transaction("rw", db.workoutExercises, db.sets, async () => {
    const exercise = await db.workoutExercises.get(workoutExerciseId);
    if (exercise !== undefined) {
      await db.workoutExercises.put({ ...exercise, deletedAt: now, updatedAt: now, dirty: DIRTY });
    }
    const sets = await db.sets.where("workoutExerciseId").equals(workoutExerciseId).toArray();
    for (const set of sets) {
      await db.sets.put({ ...set, deletedAt: now, updatedAt: now, dirty: DIRTY });
    }
  });
}

/* ------------------------------------------------------------------ *
 * Read
 * ------------------------------------------------------------------ */

/** Workout in progress: no `endedAt`, no tombstone. At most one per account. */
export async function readActiveWorkout(
  db: EasyGymDatabase,
  formula: OneRepMaxFormula,
): Promise<WorkoutDetailResponse | null> {
  // IndexedDB does not index `null`, so rows with `endedAt: null` are
  // ABSENT from the `endedAt` index and no `where(...)` will find them —
  // a silent bug, not an exception. We filter in memory; a user has
  // hundreds of workouts, not millions.
  const open = (await db.workouts.toArray())
    .filter((workout) => workout.endedAt === null && workout.deletedAt === null)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  const workout = open[0];
  return workout === undefined ? null : composeWorkout(db, workout, formula);
}

export async function readWorkout(
  db: EasyGymDatabase,
  workoutId: string,
  formula: OneRepMaxFormula,
): Promise<WorkoutDetailResponse | null> {
  const workout = await db.workouts.get(workoutId);
  if (workout === undefined || workout.deletedAt !== null) {
    return null;
  }
  return composeWorkout(db, workout, formula);
}

async function composeWorkout(
  db: EasyGymDatabase,
  workout: LocalWorkout,
  formula: OneRepMaxFormula,
): Promise<WorkoutDetailResponse> {
  const exerciseRows = (await db.workoutExercises.where("workoutId").equals(workout.id).toArray())
    .filter((row) => row.deletedAt === null)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const exercises: WorkoutExerciseResponse[] = [];
  for (const row of exerciseRows) {
    const catalog = await db.exercises.get(row.exerciseId);
    const sets = (await db.sets.where("workoutExerciseId").equals(row.id).toArray())
      .filter((set) => set.deletedAt === null)
      .sort((a, b) => a.setIndex - b.setIndex)
      .map((set): SetResponse => ({
        id: set.id,
        workoutExerciseId: row.id,
        setIndex: set.setIndex,
        weightKg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe,
        isWarmup: set.isWarmup,
        toFailure: set.toFailure,
        assisted: set.assisted,
        e1rmKg: estimate1RM(set.weightKg, set.reps, formula),
        completedAt: set.completedAt,
        updatedAt: set.updatedAt,
        deletedAt: null,
      }));

    const metricsSets = sets.map(toMetricsSet);
    exercises.push({
      id: row.id,
      workoutId: workout.id,
      exerciseId: row.exerciseId,
      // Exercises outside this database's catalog (added on another
      // device and not yet pulled) must not break the screen — the card
      // shows a fallback instead of a name and fixes itself at the first
      // sync.
      exerciseName: catalog?.name ?? "Ćwiczenie",
      muscleGroup: catalog?.muscleGroup ?? "",
      equipment: (catalog?.equipment ?? "other") as Equipment,
      orderIndex: row.orderIndex,
      notes: row.notes,
      sets,
      displayVolumeKg: displayVolumeKg(metricsSets),
      prEligibleVolumeKg: prEligibleVolumeKg(metricsSets),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: null,
    });
  }

  const allSets = exercises.flatMap((exercise) => exercise.sets.map(toMetricsSet));
  return {
    id: workout.id,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationSeconds:
      workout.endedAt === null
        ? null
        : Math.round((Date.parse(workout.endedAt) - Date.parse(workout.startedAt)) / 1000),
    isDeload: workout.isDeload,
    notes: workout.notes,
    routineId: workout.routineId,
    exercises,
    displayVolumeKg: displayVolumeKg(allSets),
    prEligibleVolumeKg: prEligibleVolumeKg(allSets),
    workingSetCount: allSets.filter((set) => !set.isWarmup).length,
    personalRecordsBrokenIn: [],
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
  };
}

function toMetricsSet(set: SetResponse) {
  return {
    setId: set.id,
    completedAt: set.completedAt,
    weightKg: set.weightKg,
    reps: set.reps,
    isWarmup: set.isWarmup,
    toFailure: set.toFailure,
    assisted: set.assisted,
  };
}
