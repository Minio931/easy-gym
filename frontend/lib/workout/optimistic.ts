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
 * Lokalne łatki na migawkę treningu. Służą **wyłącznie** do tego, żeby UI
 * pokazał stan docelowy w tej samej klatce, w której user dotknął ekranu —
 * prawdą jest odpowiedź serwera, która zaraz podmieni całą migawkę
 * (`WorkoutDetailResponse` wraca z każdej operacji).
 *
 * Czego tu świadomie NIE ma: `personalRecordsBrokenIn`. Rekord zależy od całej
 * historii ćwiczenia, której przeglądarka w tym momencie nie ma; zgadywanie
 * dałoby migającą plakietkę „PR", która po sekundzie znika. Plakietka
 * zapala się z odpowiedzi serwera (spec §3: przy rozjeździe wygrywa serwer).
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

/** Upsert serii po `id` + przenumerowanie `setIndex` od zera. */
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

/** Numery serii lecą od zera bez dziur — inaczej po usunięciu drugiej z trzech
 * zostaje „1, 3", a `setIndex` w bazie przestaje odpowiadać temu, co widać. */
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
 * Podmiana ćwiczenia na inne w tym samym miejscu listy — bez usuwania karty
 * i dodawania nowej na końcu. Serie zerujemy: ciężary i powtórzenia zapisane
 * pod starym ćwiczeniem nie mają sensu pod nowym (inna historia, inne PR-y).
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

/** Pusty trening tworzony lokalnie — ekran renderuje się, zanim serwer odpowie. */
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
