import { apiFetch } from "@/lib/api/client";
import type {
  CreateExerciseRequest,
  ExerciseHistoryResponse,
  ExerciseResponse,
} from "@/types/api";
import type { OneRepMaxFormula } from "@/lib/metrics";

/**
 * Exercise catalog: global (seed, `userId: null`) + the user's own.
 * `query` is a fuzzy search on the database side (pg_trgm) — **we do not
 * further filter the result locally**, because a local `includes()` filter
 * would reject hits the trigram considered close (typos), which is exactly
 * what this endpoint is for.
 */
export function searchExercises(
  query: string,
  signal?: AbortSignal,
): Promise<ExerciseResponse[]> {
  const suffix = query === "" ? "" : `?query=${encodeURIComponent(query)}`;
  return apiFetch<ExerciseResponse[]>(`/api/exercises${suffix}`, { signal });
}

export function createExercise(body: CreateExerciseRequest): Promise<ExerciseResponse> {
  return apiFetch<ExerciseResponse>("/api/exercises", { method: "POST", body });
}

export function exerciseHistory(
  exerciseId: string,
  options: { limit?: number; formula?: OneRepMaxFormula; signal?: AbortSignal } = {},
): Promise<ExerciseHistoryResponse> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 5) });
  if (options.formula !== undefined) {
    params.set("formula", options.formula);
  }
  return apiFetch<ExerciseHistoryResponse>(
    `/api/exercises/${exerciseId}/history?${params.toString()}`,
    { signal: options.signal },
  );
}
