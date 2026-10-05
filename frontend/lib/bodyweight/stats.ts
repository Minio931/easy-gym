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
 * Body-weight statistics computed LOCALLY — a fallback for no network.
 *
 * Online the screen takes `GET /api/body-weights/stats`: the server is the
 * source of truth and computes the same thing. Here we assemble exactly the
 * same response shape from `lib/metrics.ts` functions, which mirror the
 * backend's `metrics` package — this way the screen has one data entry
 * point, not two render modes.
 *
 * A rule divergence between the two sides would mean the same weight shows
 * a different weekly average depending on signal. Hence NO local
 * arithmetic here: every number comes from a tested metrics function.
 */

/** How many weeks back the trend compares — same constant as `TREND_WEEKS_BACK` on the server. */
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
 * The trend is computed by INDEX in the list of weeks with data, not by
 * calendar — same as on the server. With a weigh-in break "4 weeks back"
 * means "the fourth earlier week in which anything was recorded", not
 * "exactly 28 days ago". Calendar counting would give `null` after every
 * holiday, i.e. no trend exactly when it is most interesting.
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
