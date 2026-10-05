import type { BodyWeightResponse, WeeklyBodyWeightResponse } from "@/types/api";

/**
 * Body-weight chart points. Two series on one Y axis — raw measurements and
 * weekly averages are the same quantity in the same kilograms, so a shared
 * scale is correct here, not a violation of the "one Y axis" rule
 * (DESIGN §10).
 */

const DAY_MS = 86_400_000;

/**
 * Calendar day to X-axis position.
 *
 * We take LOCAL NOON, not midnight. Midnight lies on the day boundary, so
 * at a DST transition it can land in the previous day — the point then
 * jumps one tick for no reason in the data. Same convention as in
 * `lib/metrics.ts`.
 */
export function dayToTime(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12).getTime();
}

export interface RawWeightPoint {
  t: number;
  measuredOn: string;
  weightKg: number;
  id: string;
}

export interface WeeklyWeightPoint {
  t: number;
  year: number;
  week: number;
  from: string;
  to: string;
  averageKg: number;
  measurementCount: number;
  incomplete: boolean;
  deltaKg: number | null;
}

export function rawPoints(entries: readonly BodyWeightResponse[]): RawWeightPoint[] {
  return [...entries]
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map((entry) => ({
      t: dayToTime(entry.measuredOn),
      measuredOn: entry.measuredOn,
      weightKg: entry.weightKg,
      id: entry.id,
    }));
}

/**
 * The weekly average sits in the MIDDLE of the week, not at its start or
 * end. The Monday-to-Sunday mean does not describe Monday — placed on the
 * boundary it would suggest it does, and would drift away from the cloud
 * of raw measurements it is supposed to pass through.
 */
export function weeklyPoints(
  weeks: readonly WeeklyBodyWeightResponse[],
): WeeklyWeightPoint[] {
  return [...weeks]
    .sort((a, b) => (a.year - b.year) || (a.week - b.week))
    .map((week) => ({
      // The week runs from Monday 00:00 to Monday 00:00, so its midpoint
      // is Thursday 12:00 — exactly three days from Monday NOON, which
      // `dayToTime` returns. Adding another half day (the "3.5 days"
      // reflex) shifts the point to Friday and the week ends up skewed.
      t: dayToTime(week.from) + 3 * DAY_MS,
      year: week.year,
      week: week.week,
      from: week.from,
      to: week.to,
      averageKg: week.averageKg,
      measurementCount: week.measurementCount,
      incomplete: week.incomplete,
      deltaKg: week.deltaKg,
    }));
}

/**
 * Shared Y-axis domain for both series, with a small padding.
 *
 * Without it, Recharts picks a per-series domain and the averages line can
 * fall outside the measurement cloud, even though by definition it lies in
 * its middle. The padding is proportional to the span, but no less than
 * half a kilogram — with weight stable to 200 g, a padless chart becomes
 * a flat line at the edge.
 */
export function weightDomain(
  raw: readonly RawWeightPoint[],
  weekly: readonly WeeklyWeightPoint[],
): [number, number] | null {
  const values = [...raw.map((p) => p.weightKg), ...weekly.map((p) => p.averageKg)];
  if (values.length === 0) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.1, 0.5);
  return [round1(min - pad), round1(max + pad)];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
