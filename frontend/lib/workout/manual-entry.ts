import { addWorkoutExercise, createWorkout, saveSet } from "@/lib/api/workouts";
import { getDatabase } from "@/lib/db/database";
import { persistServerWorkout } from "@/lib/db/workout-repository";
import { uuid } from "@/lib/workout/uuid";
import type { WorkoutDetailResponse } from "@/types/api";

/**
 * Ręczne wpisanie treningu, który już się odbył (PROMPT: „import" historycznych
 * treningów — backend nie potrzebuje osobnego endpointu, `POST /api/workouts`
 * przyjmuje `startedAt`/`endedAt` z klienta, patrz backend/API.md).
 *
 * Świadomie BEZ ścieżki offline (w przeciwieństwie do `lib/bodyweight/store.ts`
 * i `lib/workout/store.ts`): to kilka kolejnych żądań (trening → ćwiczenia →
 * serie), a wpisywanie starych danych robi się w domu, nie na siłowni bez
 * zasięgu. Przy błędzie w trakcie trening może zostać częściowo zapisany na
 * serwerze — komunikat mówi to wprost, żeby nie dublować wpisu.
 */

export interface ManualSetInput {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

export interface ManualExerciseInput {
  exerciseId: string;
  sets: ManualSetInput[];
}

export interface ManualWorkoutInput {
  startedAt: string;
  endedAt: string;
  notes: string | null;
  isDeload: boolean;
  exercises: ManualExerciseInput[];
}

export async function submitManualWorkout(
  input: ManualWorkoutInput,
): Promise<WorkoutDetailResponse> {
  let workout = await createWorkout({
    id: uuid(),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    notes: input.notes,
    isDeload: input.isDeload,
  });

  for (const [orderIndex, exercise] of input.exercises.entries()) {
    const workoutExerciseId = uuid();
    workout = await addWorkoutExercise(workout.id, {
      id: workoutExerciseId,
      exerciseId: exercise.exerciseId,
      orderIndex,
    });

    for (const [setIndex, set] of exercise.sets.entries()) {
      workout = await saveSet(workout.id, workoutExerciseId, uuid(), {
        setIndex,
        weightKg: set.weightKg,
        reps: set.reps,
        isWarmup: set.isWarmup,
      });
    }
  }

  const db = getDatabase();
  if (db !== null) {
    await persistServerWorkout(db, workout).catch(() => undefined);
  }
  return workout;
}
