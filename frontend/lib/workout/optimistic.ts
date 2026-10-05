import {
  displayVolumeKg,
  estimate1RM,
  prEligibleVolumeKg,
  type ExerciseSet,
  type OneRepMaxFormula,
} from "@/lib/metrics";
import type {
  ExerciseResponse,
  SetResponse,
  WorkoutDetailResponse,
  WorkoutExerciseResponse,
} from "@/types/api";

/**
 * Local patches onto the workout snapshot. They serve **only** to let the
 * UI show the target state in the same frame in which the user touched the
 * screen — the truth is the server response, which immediately replaces
 * the whole snapshot (`WorkoutDetailResponse` returns from every operation).
 *
 * What is deliberately NOT here: `personalRecordsBrokenIn`. A record
 * depends on the full exercise history, which the browser does not have at
 * this moment; guessing would produce a flashing "PR" badge that
 * disappears a second later. The badge lights up from the server response
 * (spec §3: on a mismatch the server wins).
 */

function toMetricsSet(set: SetResponse): ExerciseSet {
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

function recomputeExercise(exercise: WorkoutExerciseResponse): WorkoutExerciseResponse {
  const metricsSets = exercise.sets.map(toMetricsSet);
  return {
    ...exercise,
    displayVolumeKg: displayVolumeKg(metricsSets),
    prEligibleVolumeKg: prEligibleVolumeKg(metricsSets),
  };
}

function recompute(workout: WorkoutDetailResponse): WorkoutDetailResponse {
  const exercises = workout.exercises.map(recomputeExercise);
  const allSets = exercises.flatMap((exercise) => exercise.sets.map(toMetricsSet));
  return {
    ...workout,
    exercises,
    displayVolumeKg: displayVolumeKg(allSets),
    prEligibleVolumeKg: prEligibleVolumeKg(allSets),
    workingSetCount: allSets.filter((set) => !set.isWarmup).length,
  };
}

export interface DraftSetValues {
  id: string;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  toFailure: boolean;
  assisted: boolean;
}

export function buildSetResponse(
  workoutExerciseId: string,
  setIndex: number,
  values: DraftSetValues,
  formula: OneRepMaxFormula,
  now: string,
): SetResponse {
  return {
    id: values.id,
    workoutExerciseId,
    setIndex,
    weightKg: values.weightKg,
    reps: values.reps,
    rpe: values.rpe,
    isWarmup: values.isWarmup,
    toFailure: values.toFailure,
    assisted: values.assisted,
    e1rmKg: estimate1RM(values.weightKg, values.reps, formula),
    completedAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** Set upsert by `id` + renumbering `setIndex` from zero. */
export function withSet(
  workout: WorkoutDetailResponse,
  workoutExerciseId: string,
  set: SetResponse,
): WorkoutDetailResponse {
  return recompute({
    ...workout,
    exercises: workout.exercises.map((exercise) => {
      if (exercise.id !== workoutExerciseId) {
        return exercise;
      }
      const existing = exercise.sets.some((candidate) => candidate.id === set.id);
      const sets = existing
        ? exercise.sets.map((candidate) => (candidate.id === set.id ? set : candidate))
        : [...exercise.sets, set];
      return { ...exercise, sets: renumber(sets) };
    }),
  });
}

export function withoutSet(
  workout: WorkoutDetailResponse,
  workoutExerciseId: string,
  setId: string,
): WorkoutDetailResponse {
  return recompute({
    ...workout,
    exercises: workout.exercises.map((exercise) =>
      exercise.id === workoutExerciseId
        ? { ...exercise, sets: renumber(exercise.sets.filter((set) => set.id !== setId)) }
        : exercise,
    ),
  });
}

/** Set numbers run from zero without gaps — otherwise after deleting the
 * second of three, "1, 3" remains, and `setIndex` in the database stops
 * matching what is visible. */
function renumber(sets: readonly SetResponse[]): SetResponse[] {
  return sets.map((set, index) => (set.setIndex === index ? set : { ...set, setIndex: index }));
}

export function buildWorkoutExercise(
  id: string,
  workout: WorkoutDetailResponse,
  exercise: ExerciseResponse,
  orderIndex: number,
  now: string,
): WorkoutExerciseResponse {
  return {
    id,
    workoutId: workout.id,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    muscleGroup: exercise.muscleGroup,
    equipment: exercise.equipment,
    orderIndex,
    notes: null,
    sets: [],
    displayVolumeKg: 0,
    prEligibleVolumeKg: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Swap one exercise for another in the same list slot — without removing
 * the card and adding a new one at the end. We reset the sets: weights and
 * reps saved under the old exercise make no sense under the new one
 * (different history, different PRs).
 */
export function withSwappedExercise(
  exercise: WorkoutExerciseResponse,
  target: ExerciseResponse,
  now: string,
): WorkoutExerciseResponse {
  return {
    ...exercise,
    exerciseId: target.id,
    exerciseName: target.name,
    muscleGroup: target.muscleGroup,
    equipment: target.equipment,
    sets: [],
    displayVolumeKg: 0,
    prEligibleVolumeKg: 0,
    updatedAt: now,
  };
}

export function withExercise(
  workout: WorkoutDetailResponse,
  exercise: WorkoutExerciseResponse,
): WorkoutDetailResponse {
  return recompute({ ...workout, exercises: [...workout.exercises, exercise] });
}

export function withoutExercise(
  workout: WorkoutDetailResponse,
  workoutExerciseId: string,
): WorkoutDetailResponse {
  return recompute({
    ...workout,
    exercises: workout.exercises
      .filter((exercise) => exercise.id !== workoutExerciseId)
      .map((exercise, index) => ({ ...exercise, orderIndex: index })),
  });
}

/** An empty workout created locally — the screen renders before the server responds. */
export function buildLocalWorkout(
  id: string,
  startedAt: string,
  routineId: string | null,
): WorkoutDetailResponse {
  return {
    id,
    startedAt,
    endedAt: null,
    durationSeconds: null,
    isDeload: false,
    notes: null,
    routineId,
    exercises: [],
    displayVolumeKg: 0,
    prEligibleVolumeKg: 0,
    workingSetCount: 0,
    personalRecordsBrokenIn: [],
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}
