import { apiFetch } from "@/lib/api/client";
import type {
  BodyWeightResponse,
  BodyWeightStatsResponse,
  SaveBodyWeightRequest,
} from "@/types/api";

/**
 * Waga ciała. `PUT` jest **upsertem po dacie**, nie po `id`: kluczem biznesowym
 * jest dzień pomiaru, więc poprawka wagi z drugiego urządzenia edytuje wpis,
 * zamiast wywalać 409 z częściowego indeksu unikalnego (backend/API.md).
 *
 * Średnie tygodniowe, kroczącą 7-dniową i trend liczy serwer — te same reguły
 * co `lib/metrics.ts`, który jest ich mirrorem i wchodzi do gry, gdy nie ma sieci.
 */

export function listBodyWeights(
  options: { from?: string; to?: string; signal?: AbortSignal } = {},
): Promise<BodyWeightResponse[]> {
  return apiFetch<BodyWeightResponse[]>(`/api/body-weights${dateQuery(options)}`, {
    signal: options.signal,
  });
}

export function bodyWeightStats(
  options: { from?: string; to?: string; signal?: AbortSignal } = {},
): Promise<BodyWeightStatsResponse> {
  return apiFetch<BodyWeightStatsResponse>(`/api/body-weights/stats${dateQuery(options)}`, {
    signal: options.signal,
  });
}

export function saveBodyWeight(body: SaveBodyWeightRequest): Promise<BodyWeightResponse> {
  return apiFetch<BodyWeightResponse>("/api/body-weights", { method: "PUT", body });
}

export function deleteBodyWeight(id: string): Promise<void> {
  return apiFetch<void>(`/api/body-weights/${id}`, { method: "DELETE" });
}

function dateQuery(options: { from?: string; to?: string }): string {
  const params = new URLSearchParams();
  if (options.from !== undefined) {
    params.set("from", options.from);
  }
  if (options.to !== undefined) {
    params.set("to", options.to);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}
