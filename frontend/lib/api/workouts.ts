import { apiFetch } from "@/lib/api/client";
import type { OneRepMaxFormula } from "@/lib/metrics";
import type {
  AddWorkoutExerciseRequest,
  CreateWorkoutRequest,
  SaveSetRequest,
  UpdateWorkoutRequest,
  WorkoutDetailResponse,
  WorkoutListResponse,
} from "@/types/api";

/**
 * All exercise and set operations return the WHOLE workout
 * (`WorkoutDetailResponse`) — volumes, set counter and
 * `personalRecordsBrokenIn` recomputed by the server. The frontend swaps the
 * snapshot instead of patching state.
 */

function formulaQuery(formula?: OneRepMaxFormula): string {
  return formula === undefined ? "" : `?formula=${formula}`;
}

/** `null` = the server responded 204, i.e. there is no open workout. */
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

/**
 * History list. `limit`/`offset` instead of a cursor, because the backend
 * returns it that way and with two users offset pagination cannot drift.
 */
export function listWorkouts(
  options: { limit?: number; offset?: number; from?: string; to?: string; signal?: AbortSignal } = {},
): Promise<WorkoutListResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 30),
    offset: String(options.offset ?? 0),
  });
  if (options.from !== undefined) {
    params.set("from", options.from);
  }
  if (options.to !== undefined) {
    params.set("to", options.to);
  }
  return apiFetch<WorkoutListResponse>(`/api/workouts?${params.toString()}`, {
    signal: options.signal,
  });
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

/** Upsert by `setId` — resending the same request is safe. */
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

/** Soft delete (tombstone) — the set disappears from reads but will travel through sync. */
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
