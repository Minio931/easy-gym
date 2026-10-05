import { apiFetch } from "@/lib/api/client";
import type { RoutineResponse } from "@/types/api";

/**
 * Workout templates (`backend/API.md` → "Workout templates").
 *
 * `PUT` **replaces the whole list of items**: an item omitted from the
 * request receives a tombstone, it does not silently disappear — removing
 * an exercise from the template must also reach the other device. That is
 * why the editor always sends the full set of items, never a diff.
 */

export interface SaveRoutineItemRequest {
  /** `id` of an existing item; omitted = new item. */
  id?: string;
  exerciseId: string;
  orderIndex: number;
  /** 1–50 server-side; `null` = no target. */
  targetSets?: number | null;
  /** 1–100 server-side; `null` = no target. */
  targetReps?: number | null;
}

export interface SaveRoutineRequest {
  /** UUID assigned by the client — the same one lands in Dexie before send. */
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

/** Soft delete along with items. */
export function deleteRoutine(id: string): Promise<void> {
  return apiFetch<void>(`/api/routines/${id}`, { method: "DELETE" });
}
