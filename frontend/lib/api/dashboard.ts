import { apiFetch } from "@/lib/api/client";
import type { DashboardResponse } from "@/types/api";

/**
 * Pulpit. Wszystkie agregaty liczy baza (`GROUP BY`/`SUM`, funkcja okna na
 * rekordach) — przeglądarka nie ściąga tysięcy serii, żeby je zsumować
 * (PROMPT §9). Front dostaje gotowe tygodnie i tylko je rysuje.
 *
 * `includeDeload` przełącza to, czy porównanie trendu objętości pomija tygodnie
 * deloadowe. Domyślnie pomija — tydzień po deloadzie porównuje się do ostatniego
 * tygodnia nie-deload PRZED nim, bo inaczej każdy powrót po lekkim tygodniu
 * wyglądałby na skok formy.
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
