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
 * Dashboard range: how much we fetch and how we turn response instants into
 * calendar days.
 */

/**
 * How many weeks the dashboard fetches in one request: six months plus the
 * current week. Range pills filter the already-fetched weeks without hitting
 * the network — 27 rows of aggregates weigh practically nothing, and
 * switching "3M → 1M" in the gym cannot wait for signal.
 */
export const DASHBOARD_WEEKS = 27;

/**
 * The dashboard only shows ranges that can be drawn with one bar per week.
 * At "1Y" there would be 53 bars across 390 px, i.e. 4 px strokes — a chart
 * that tells you nothing. The longer horizon is shown by the calendar and
 * the monthly workout count.
 */
export const DASHBOARD_RANGES = CHART_RANGES.filter((range) =>
  (["1M", "3M", "6M"] as const).some((key) => key === range.key),
);

export interface DashboardDates {
  /** Monday of the first week in the range. */
  from: IsoDate;
  /** Last day of the range, INCLUSIVE. */
  to: IsoDate;
}

/**
 * `from`/`to` from the response are instants (`2026-03-15T23:00:00Z` =
 * midnight in Warsaw), and `to` is **exclusive** — it marks the start of
 * tomorrow. Taking the first ten characters of them would yield an earlier
 * day and a calendar shifted a whole week back, because 15.03 is a Sunday
 * and the grid snaps to Monday anyway.
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
