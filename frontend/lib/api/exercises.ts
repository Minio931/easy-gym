import { apiFetch } from "@/lib/api/client";
import type {
  CreateExerciseRequest,
  ExerciseHistoryResponse,
  ExerciseResponse,
} from "@/types/api";
import type { OneRepMaxFormula } from "@/lib/metrics";

/**
 * Katalog ćwiczeń: globalne (seed, `userId: null`) + własne użytkownika.
 * `query` to fuzzy search po stronie bazy (pg_trgm) — **nie filtrujemy wyniku
 * dodatkowo lokalnie**, bo lokalny filtr `includes()` odrzuciłby trafienia,
 * które trigram uznał za bliskie (literówki), czyli dokładnie to, po co ten
 * endpoint istnieje.
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
