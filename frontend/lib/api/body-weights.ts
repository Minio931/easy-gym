import { apiFetch } from "@/lib/api/client";
import type {
  BodyWeightResponse,
  BodyWeightStatsResponse,
  SaveBodyWeightRequest,
} from "@/types/api";

/**
 * Body weight. `PUT` is an **upsert by date**, not by `id`: the business key
 * is the measurement day, so a weight correction from another device edits
 * the entry instead of blowing up with a 409 from the partial unique index
 * (backend/API.md).
 *
 * Weekly averages, the 7-day rolling average and the trend are computed by
 * the server — same rules as `lib/metrics.ts`, which is their mirror and
 * takes over when there is no network.
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
