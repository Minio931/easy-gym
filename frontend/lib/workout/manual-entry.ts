import { addWorkoutExercise, createWorkout, saveSet } from "@/lib/api/workouts";
import { getDatabase } from "@/lib/db/database";
import { persistServerWorkout } from "@/lib/db/workout-repository";
import { uuid } from "@/lib/workout/uuid";
import type { WorkoutDetailResponse } from "@/types/api";

/**
 * Manual entry of a workout that has already happened (PROMPT: "import" of
 * historical workouts — the backend does not need a separate endpoint,
 * `POST /api/workouts` accepts `startedAt`/`endedAt` from the client, see
 * backend/API.md).
 *
 * Deliberately WITHOUT an offline path (unlike `lib/bodyweight/store.ts` and
 * `lib/workout/store.ts`): this is several sequential requests (workout →
 * exercises → sets), and typing in old data is done at home, not in a gym
 * without signal. On a mid-flight error the workout may end up partially
 * saved on the server — the UI message says so explicitly, to avoid
 * duplicating the entry.
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
