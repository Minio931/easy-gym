import { CHART_RANGES } from "@/lib/charts";
import {
  formatIsoDate,
  isoWeekMondayStart,
  isoWeekOfDate,
  parseIsoDate,
  warsawCalendarDate,
  type IsoDate,
} from "@/lib/metrics";

/**
 * Zakres pulpitu: ile go pobieramy i jak zamieniamy momenty z odpowiedzi
 * na dni kalendarzowe.
 */

/**
 * Ile tygodni pulpit pobiera jednym żądaniem: pół roku plus tydzień bieżący.
 * Pigułki zakresu filtrują już pobrane tygodnie, bez ruszania sieci — 27
 * wierszy agregatów waży tyle co nic, a przełączenie „3M → 1M" w hali nie może
 * czekać na zasięg.
 */
export const DASHBOARD_WEEKS = 27;

/**
 * Pulpit pokazuje tylko te zakresy, które da się narysować słupkiem na
 * tydzień. Przy „1R" byłyby 53 słupki na 390 px, czyli kreski po 4 px —
 * wykres, z którego nic nie wynika. Dłuższy horyzont pokazują kalendarz
 * i treningi w miesiącach.
 */
export const DASHBOARD_RANGES = CHART_RANGES.filter((range) =>
  (["1M", "3M", "6M"] as const).some((key) => key === range.key),
);

export interface DashboardDates {
  /** Poniedziałek pierwszego tygodnia zakresu. */
  from: IsoDate;
  /** Ostatni dzień zakresu, WŁĄCZNIE. */
  to: IsoDate;
}

/**
 * `from`/`to` z odpowiedzi to momenty (`2026-03-15T23:00:00Z` = północ
 * w Warszawie), a `to` jest **wyłączne** — wskazuje początek jutra. Branie
 * z nich pierwszych dziesięciu znaków dałoby dzień wcześniejszy i kalendarz
 * cofnięty o cały tydzień, bo 15.03 to niedziela, a siatka i tak zaczyna się
 * w poniedziałek.
 */
export function dashboardDates(fromInstant: string, toInstant: string): DashboardDates {
  const firstDay = warsawCalendarDate(fromInstant);
  const exclusiveEnd = parseIsoDate(warsawCalendarDate(toInstant));
  exclusiveEnd.setDate(exclusiveEnd.getDate() - 1);
  return {
    from: isoWeekMondayStart(isoWeekOfDate(firstDay)),
    to: formatIsoDate(exclusiveEnd),
  };
}
