import { apiFetch } from "@/lib/api/client";
import type { OneRepMaxFormula } from "@/lib/metrics";
import type {
  AddWorkoutExerciseRequest,
  CreateWorkoutRequest,
  SaveSetRequest,
  UpdateWorkoutRequest,
  WorkoutDetailResponse,
} from "@/types/api";

/**
 * Wszystkie operacje na ćwiczeniach i seriach zwracają CAŁY trening
 * (`WorkoutDetailResponse`) — objętości, licznik serii i `personalRecordsBrokenIn`
 * przeliczone przez serwer. Front podmienia migawkę zamiast doklejać stan.
 */

function formulaQuery(formula?: OneRepMaxFormula): string {
  return formula === undefined ? "" : `?formula=${formula}`;
}

/** `null` = serwer odpowiedział 204, czyli nie ma otwartego treningu. */
export async function getActiveWorkout(
  formula?: OneRepMaxFormula,
  signal?: AbortSignal,
): Promise<WorkoutDetailResponse | null> {
  const result = await apiFetch<WorkoutDetailResponse | undefined>(
    `/api/workouts/active${formulaQuery(formula)}`,
    { signal },
  );
  return result ?? null;
}

export function getWorkout(
  id: string,
  formula?: OneRepMaxFormula,
  signal?: AbortSignal,
): Promise<WorkoutDetailResponse> {
  return apiFetch<WorkoutDetailResponse>(`/api/workouts/${id}${formulaQuery(formula)}`, {
    signal,
  });
}

export function createWorkout(body: CreateWorkoutRequest): Promise<WorkoutDetailResponse> {
  return apiFetch<WorkoutDetailResponse>("/api/workouts", { method: "POST", body });
}

export function updateWorkout(
  id: string,
  body: UpdateWorkoutRequest,
): Promise<WorkoutDetailResponse> {
  return apiFetch<WorkoutDetailResponse>(`/api/workouts/${id}`, { method: "PUT", body });
}

export function finishWorkout(id: string): Promise<WorkoutDetailResponse> {
  return apiFetch<WorkoutDetailResponse>(`/api/workouts/${id}/finish`, { method: "POST" });
}

export function discardWorkout(id: string): Promise<void> {
  return apiFetch<void>(`/api/workouts/${id}`, { method: "DELETE" });
}

export function addWorkoutExercise(
  workoutId: string,
  body: AddWorkoutExerciseRequest,
): Promise<WorkoutDetailResponse> {
  return apiFetch<WorkoutDetailResponse>(`/api/workouts/${workoutId}/exercises`, {
    method: "POST",
    body,
  });
}

export function updateWorkoutExercise(
  workoutId: string,
  workoutExerciseId: string,
  body: AddWorkoutExerciseRequest,
): Promise<WorkoutDetailResponse> {
  return apiFetch<WorkoutDetailResponse>(
    `/api/workouts/${workoutId}/exercises/${workoutExerciseId}`,
    { method: "PUT", body },
  );
}

export function removeWorkoutExercise(
  workoutId: string,
  workoutExerciseId: string,
): Promise<WorkoutDetailResponse> {
  return apiFetch<WorkoutDetailResponse>(
    `/api/workouts/${workoutId}/exercises/${workoutExerciseId}`,
    { method: "DELETE" },
  );
}

/** Upsert po `setId` — ponowienie tego samego żądania jest bezpieczne. */
export function saveSet(
  workoutId: string,
  workoutExerciseId: string,
  setId: string,
  body: SaveSetRequest,
): Promise<WorkoutDetailResponse> {
  return apiFetch<WorkoutDetailResponse>(
    `/api/workouts/${workoutId}/exercises/${workoutExerciseId}/sets/${setId}`,
    { method: "PUT", body: { ...body, id: setId } },
  );
}

/** Soft delete (tombstone) — seria znika z odczytów, ale dojedzie przez sync. */
export function removeSet(
  workoutId: string,
  workoutExerciseId: string,
  setId: string,
): Promise<WorkoutDetailResponse> {
  return apiFetch<WorkoutDetailResponse>(
    `/api/workouts/${workoutId}/exercises/${workoutExerciseId}/sets/${setId}`,
    { method: "DELETE" },
  );
}
