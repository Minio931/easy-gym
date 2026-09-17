import { apiFetch } from "@/lib/api/client";
import type { RoutineResponse } from "@/types/api";

export function listRoutines(signal?: AbortSignal): Promise<RoutineResponse[]> {
  return apiFetch<RoutineResponse[]>("/api/routines", { signal });
}

export function getRoutine(id: string, signal?: AbortSignal): Promise<RoutineResponse> {
  return apiFetch<RoutineResponse>(`/api/routines/${id}`, { signal });
}
