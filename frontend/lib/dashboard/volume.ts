import {
  MUSCLE_GROUP_BUCKETS,
  OTHER_MUSCLE_BUCKET,
  bucketForMuscleGroup,
  bucketWeeklyVolume,
  type MuscleGroupBucket,
} from "@/lib/charts";
import {
  formatIsoDate,
  isoWeekOfDate,
  isoWeekSundayEnd,
  parseIsoDate,
} from "@/lib/metrics";
import type { WeeklyVolumeResponse } from "@/types/api";

/**
 * Weekly volume chart rows and the muscle-group breakdown.
 *
 * Pure functions: the backend returns volume already summed per week and
 * group (`GROUP BY`, PROMPT §9); here we only arrange it into a shape that
 * draws without computing in JSX — bucketing the 11 groups into 8 palette
 * slots lives in `lib/charts.ts` and is strictly presentational.
 */

export interface VolumeRow {
  year: number;
  week: number;
  from: string;
  to: string;
  /** Axis label: just the ISO week number — nothing more fits at 390 px. */
  label: string;
  totalKg: number;
  workoutCount: number;
  isDeload: boolean;
  /** Bucket key → kilograms. Buckets with no volume are absent. */
  kg: Record<string, number>;
}

/**
 * Fills in the weeks missing from the response.
 *
 * The backend returns ONLY weeks with training. Without padding, a
 * six-week break disappears from the axis, and the last bar from two
 * months ago sits next to the current one and looks like last week — the
 * same kind of lie as a categorical axis on the exercise chart (stage 6).
 * A week without training has a real value here: zero.
 *
 * This is not aggregating in the browser — the sums arrive computed; here
 * we only add empty axis slots.
 */
export function fillMissingWeeks(
  weeks: readonly WeeklyVolumeResponse[],
  fromIso: string,
  toIso: string,
): WeeklyVolumeResponse[] {
  const byMonday = new Map(weeks.map((week) => [week.from, week]));
  const cursor = parseIsoDate(fromIso);
  const end = parseIsoDate(toIso);
  const filled: WeeklyVolumeResponse[] = [];

  while (cursor <= end) {
    const monday = formatIsoDate(cursor);
    const existing = byMonday.get(monday);
    if (existing === undefined) {
      const week = isoWeekOfDate(monday);
      filled.push({
        year: week.year,
        week: week.week,
        from: monday,
        to: isoWeekSundayEnd(week),
        totalKg: 0,
        byMuscleGroup: {},
        workoutCount: 0,
        isDeload: false,
      });
    } else {
      filled.push(existing);
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return filled;
}

export function volumeRows(weeks: readonly WeeklyVolumeResponse[]): VolumeRow[] {
  return weeks.map((week) => {
    const kg: Record<string, number> = {};
    for (const entry of bucketWeeklyVolume(week.byMuscleGroup)) {
      kg[entry.bucket.key] = entry.kg;
    }
    return {
      year: week.year,
      week: week.week,
      from: week.from,
      to: week.to,
      label: String(week.week),
      totalKg: week.totalKg,
      workoutCount: week.workoutCount,
      isDeload: week.isDeload,
      kg,
    };
  });
}

/**
 * Buckets present over the whole range, sorted by palette slot.
 *
 * Computed once for the WHOLE range, not per week: stack segments must
 * have a stable order between bars, otherwise the same color drifts
 * vertically and the chart "flickers" as the eye scans it.
 */
export function activeBuckets(rows: readonly VolumeRow[]): MuscleGroupBucket[] {
  const seen = new Map<string, MuscleGroupBucket>();
  for (const row of rows) {
    for (const [key, kg] of Object.entries(row.kg)) {
      if (kg > 0 && !seen.has(key)) {
        seen.set(key, bucketByKey(key));
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.slot - b.slot);
}

function bucketByKey(key: string): MuscleGroupBucket {
  // Row keys come from `bucketWeeklyVolume`, so a bucket with that key
  // always exists; we look it up by any group that belongs to it.
  const found = BUCKETS_BY_KEY.get(key);
  if (found === undefined) {
    throw new Error(`Unknown bucket: ${key}`);
  }
  return found;
}

const BUCKETS_BY_KEY = new Map<string, MuscleGroupBucket>(
  [...MUSCLE_GROUP_BUCKETS, OTHER_MUSCLE_BUCKET].map((bucket) => [bucket.key, bucket]),
);

/**
 * Breakdown by the FULL groups from the database (11 of them), summed over
 * the whole range and sorted descending. This is the place where every
 * group is visible — the chart shows 8 buckets, because that is how many
 * palette slots exist (DESIGN §3.4).
 */
export interface MuscleGroupTotal {
  group: string;
  bucket: MuscleGroupBucket;
  kg: number;
  /** Share of the range's volume, 0–1. */
  share: number;
}

export function muscleGroupTotals(weeks: readonly WeeklyVolumeResponse[]): MuscleGroupTotal[] {
  const sums = new Map<string, number>();
  for (const week of weeks) {
    for (const [group, kg] of Object.entries(week.byMuscleGroup)) {
      sums.set(group, (sums.get(group) ?? 0) + kg);
    }
  }
  const total = [...sums.values()].reduce((acc, kg) => acc + kg, 0);
  return [...sums.entries()]
    .filter(([, kg]) => kg > 0)
    .map(([group, kg]) => ({
      group,
      bucket: bucketForMuscleGroup(group),
      kg,
      // A range with no sets has no shares — zero instead of NaN,
      // because `NaN%` in a table looks like a data error when it is a
      // missing value.
      share: total > 0 ? kg / total : 0,
    }))
    .sort((a, b) => b.kg - a.kg);
}

/* ------------------------------------------------------------------ *
 * Bar shape
 * ------------------------------------------------------------------ */

/** Gap between stack segments, in px (DESIGN §10). */
export const SEGMENT_GAP = 2;
/** Bar end radius, in px (DESIGN §10). */
export const BAR_RADIUS = 4;

/**
 * Stack segment path: rounded only on the ends that are ends of the WHOLE
 * bar. Rounding each segment separately would scatter the stack into a
 * chain of pills, and an SVG `rx` rectangle cannot round only two corners.
 *
 * The radius is clamped to half the height and width — a thin segment
 * with a full 4 px would flip the arcs the other way.
 */
export function roundedBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  topRadius: number,
  bottomRadius: number,
): string {
  const limit = Math.min(width / 2, height / 2);
  const top = Math.max(0, Math.min(topRadius, limit));
  const bottom = Math.max(0, Math.min(bottomRadius, limit));
  const right = x + width;
  const foot = y + height;

  const parts = [`M ${x} ${y + top}`];
  parts.push(top > 0 ? `A ${top} ${top} 0 0 1 ${x + top} ${y}` : `L ${x} ${y}`);
  parts.push(`L ${right - top} ${y}`);
  if (top > 0) {
    parts.push(`A ${top} ${top} 0 0 1 ${right} ${y + top}`);
  }
  parts.push(`L ${right} ${foot - bottom}`);
  if (bottom > 0) {
    parts.push(`A ${bottom} ${bottom} 0 0 1 ${right - bottom} ${foot}`);
  }
  parts.push(`L ${x + bottom} ${foot}`);
  if (bottom > 0) {
    parts.push(`A ${bottom} ${bottom} 0 0 1 ${x} ${foot - bottom}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * Whether a given bucket is this week's lowest/highest visible segment.
 * Recharts stacks from the first series upward, so "the first non-zero in
 * slot order" sits at the bottom of the bar.
 */
export function segmentEnds(
  row: VolumeRow,
  bucketKey: string,
  order: readonly MuscleGroupBucket[],
): { first: boolean; last: boolean } {
  const visible = order.filter((bucket) => (row.kg[bucket.key] ?? 0) > 0).map((b) => b.key);
  return {
    first: visible[0] === bucketKey,
    last: visible[visible.length - 1] === bucketKey,
  };
}
