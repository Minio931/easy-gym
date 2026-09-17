import { apiFetch } from "@/lib/api/client";
import type { RoutineResponse } from "@/types/api";

/**
 * Szablony treningów (`backend/API.md` → „Szablony treningów").
 *
 * `PUT` **podmienia całą listę pozycji**: pozycja pominięta w żądaniu dostaje
 * tombstone, a nie znika po cichu — usunięcie ćwiczenia z szablonu też musi
 * dojechać do drugiego urządzenia. Dlatego edytor zawsze wysyła komplet
 * pozycji, nigdy różnicy.
 */

export interface SaveRoutineItemRequest {
  /** `id` istniejącej pozycji; pominięte = nowa pozycja. */
  id?: string;
  exerciseId: string;
  orderIndex: number;
  /** 1–50 po stronie serwera; `null` = bez celu. */
  targetSets?: number | null;
  /** 1–100 po stronie serwera; `null` = bez celu. */
  targetReps?: number | null;
}

export interface SaveRoutineRequest {
  /** UUID nadany przez klienta — ten sam trafia do Dexie przed wysłaniem. */
  id?: string;
  name: string;
  notes?: string | null;
  items: SaveRoutineItemRequest[];
}

export function listRoutines(signal?: AbortSignal): Promise<RoutineResponse[]> {
  return apiFetch<RoutineResponse[]>("/api/routines", { signal });
}

export function getRoutine(id: string, signal?: AbortSignal): Promise<RoutineResponse> {
  return apiFetch<RoutineResponse>(`/api/routines/${id}`, { signal });
}

export function createRoutine(body: SaveRoutineRequest): Promise<RoutineResponse> {
  return apiFetch<RoutineResponse>("/api/routines", { method: "POST", body });
}

export function updateRoutine(id: string, body: SaveRoutineRequest): Promise<RoutineResponse> {
  return apiFetch<RoutineResponse>(`/api/routines/${id}`, { method: "PUT", body });
}

/** Soft delete razem z pozycjami. */
export function deleteRoutine(id: string): Promise<void> {
  return apiFetch<void>(`/api/routines/${id}`, { method: "DELETE" });
}
