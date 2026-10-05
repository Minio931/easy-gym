import { apiFetch } from "@/lib/api/client";
import type { DashboardResponse } from "@/types/api";

/**
 * Dashboard. All aggregates are computed by the database (`GROUP BY`/`SUM`,
 * window function over records) — the browser does not pull thousands of sets
 * to sum them up (PROMPT §9). The frontend receives ready-made weeks and
 * merely draws them.
 *
 * `includeDeload` toggles whether the volume trend comparison skips deload
 * weeks. Default: skip — a post-deload week is compared to the last non-deload
 * week BEFORE it, otherwise every return after a light week would look like
 * a jump in form.
 */
export function getDashboard(
  options: { weeks?: number; includeDeload?: boolean; signal?: AbortSignal } = {},
): Promise<DashboardResponse> {
  const params = new URLSearchParams({ weeks: String(options.weeks ?? 12) });
  if (options.includeDeload === true) {
    params.set("includeDeload", "true");
  }
  return apiFetch<DashboardResponse>(`/api/dashboard?${params.toString()}`, {
    signal: options.signal,
  });
}
