import {
  isoWeekMondayStart,
  isoWeekSundayEnd,
  round2,
  sevenDayRollingAverage,
  weeklyAverages,
  weekOverWeekDeltaKg,
  weekOverWeekDeltaPercent,
} from "@/lib/metrics";
import type {
  BodyWeightResponse,
  BodyWeightStatsResponse,
  BodyWeightTrendResponse,
  RollingAveragePoint,
  WeeklyBodyWeightResponse,
} from "@/types/api";

/**
 * Statystyki wagi policzone LOKALNIE — zapas na brak sieci.
 *
 * Online ekran bierze `GET /api/body-weights/stats`: serwer jest źródłem prawdy
 * i liczy to samo. Tutaj składamy dokładnie ten sam kształt odpowiedzi
 * z funkcji `lib/metrics.ts`, które są mirrorem pakietu `metrics` z backendu
 * — dzięki temu ekran ma jedno wejście danych, a nie dwa tryby renderowania.
 *
 * Rozjazd reguł po obu stronach oznaczałby, że ta sama waga pokazuje inną
 * średnią tygodniową zależnie od zasięgu. Dlatego tu NIE MA własnej
 * arytmetyki: każda liczba pochodzi z przetestowanej funkcji metryk.
 */

/** Ile tygodni wstecz porównuje trend — ta sama stała co `TREND_WEEKS_BACK` na serwerze. */
const TREND_WEEKS_BACK = 4;

export function computeLocalStats(
  entries: readonly BodyWeightResponse[],
): BodyWeightStatsResponse {
  const chronological = [...entries].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const metricsEntries = chronological.map((entry) => ({
    measuredOn: entry.measuredOn,
    weightKg: entry.weightKg,
  }));

  const weeks = weeklyAverages(metricsEntries);

  const weekly: WeeklyBodyWeightResponse[] = weeks.map((week) => ({
    year: week.week.year,
    week: week.week.week,
    from: isoWeekMondayStart(week.week),
    to: isoWeekSundayEnd(week.week),
    measurementCount: week.measurementCount,
    averageKg: week.averageKg,
    incomplete: week.incomplete,
    deltaKg: weekOverWeekDeltaKg(weeks, week.week),
    deltaPercent: weekOverWeekDeltaPercent(weeks, week.week),
  }));

  const rollingSevenDay: RollingAveragePoint[] = [...sevenDayRollingAverage(metricsEntries)]
    .map(([date, averageKg]) => ({ date, averageKg }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    entries: chronological,
    weekly,
    rollingSevenDay,
    latest: chronological.at(-1) ?? null,
    fourWeekTrend: trendOf(weekly),
  };
}

/**
 * Trend liczy się po POZYCJACH w liście tygodni z danymi, nie po kalendarzu —
 * tak samo jak na serwerze. Przy przerwie w ważeniu „4 tygodnie wstecz" znaczy
 * więc „czwarty wcześniejszy tydzień, w którym cokolwiek zapisano", a nie
 * „dokładnie 28 dni temu". Liczenie kalendarzowe dawałoby `null` po każdym
 * urlopie, czyli brak trendu dokładnie wtedy, gdy jest najciekawszy.
 */
function trendOf(weekly: readonly WeeklyBodyWeightResponse[]): BodyWeightTrendResponse | null {
  if (weekly.length <= TREND_WEEKS_BACK) {
    return null;
  }
  const current = weekly[weekly.length - 1];
  const past = weekly[weekly.length - 1 - TREND_WEEKS_BACK];
  const deltaKg = round2(current.averageKg - past.averageKg);
  return {
    fromYear: past.year,
    fromWeek: past.week,
    toYear: current.year,
    toWeek: current.week,
    fromAverageKg: past.averageKg,
    toAverageKg: current.averageKg,
    deltaKg,
    deltaPercent: past.averageKg === 0 ? 0 : round2((deltaKg / past.averageKg) * 100),
  };
}
