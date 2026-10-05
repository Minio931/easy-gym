import { subMonths, subYears } from "date-fns";

/**
 * Shared chart logic: time ranges and mapping of series to palette slots.
 * Pure functions — chart components should draw, not compute.
 *
 * Colors are NOT stored here as values. They live in `app/globals.css`
 * (`--series-1` … `--series-8`, separate values for light and dark themes)
 * and are only referenced by CSS variable names here. Hard-coding hex values
 * in TS would create a second palette that diverges from the first at the
 * first color tweak — and a chart in the light theme with dark-theme colors.
 */

/* ------------------------------------------------------------------ *
 * Time range
 * ------------------------------------------------------------------ */

export type ChartRange = "1M" | "3M" | "6M" | "1R" | "ALL";

export const CHART_RANGES: readonly { key: ChartRange; label: string }[] = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1R", label: "1R" },
  { key: "ALL", label: "Całość" },
];

export const DEFAULT_CHART_RANGE: ChartRange = "3M";

/**
 * Range start as an instant, or `null` for "All".
 *
 * We compute calendar-wise (`subMonths`), not "30 days back": a user reading
 * "3M" expects the same day of the month, not 90 days. For February `subMonths`
 * clamps the day to the end of the month, which is the desired behavior —
 * we don't want it jumping to March.
 *
 * Arithmetic runs in LOCAL time, so a DST shift inside the range moves the
 * resulting instant by one hour. We intentionally don't correct for this: for
 * a threshold measured in months an hour does not change a single point on
 * the chart, and pinning to `Europe/Warsaw` (as in `lib/metrics.ts`) would be
 * machinery without effect. In the metrics it's the other way around and
 * rightly so — there the hour decides which ISO week a session belongs to.
 */
export function rangeStart(range: ChartRange, now: Date): Date | null {
  switch (range) {
    case "1M":
      return subMonths(now, 1);
    case "3M":
      return subMonths(now, 3);
    case "6M":
      return subMonths(now, 6);
    case "1R":
      return subYears(now, 1);
    case "ALL":
      return null;
  }
}

/**
 * Filter a list by range. The boundary is **closed from below** (`>=`): a
 * session exactly three months ago belongs to "3M". Excluding it would give
 * a chart from which, on every refresh, the leftmost point disappears for no
 * reason visible to the viewer.
 */
export function filterByRange<T>(
  items: readonly T[],
  range: ChartRange,
  now: Date,
  instantOf: (item: T) => string,
): T[] {
  const start = rangeStart(range, now);
  if (start === null) {
    return [...items];
  }
  const cutoff = start.getTime();
  return items.filter((item) => Date.parse(instantOf(item)) >= cutoff);
}

/* ------------------------------------------------------------------ *
 * Palette slots
 * ------------------------------------------------------------------ */

export const SERIES_SLOT_COUNT = 8;

/**
 * Series color as a CSS variable. Slots are 1-indexed (`seriesColor(1)`), to
 * match the token names and DESIGN.md.
 *
 * Above the eighth series we **do not wrap the palette** — slot order is a
 * safety mechanism for colorblindness (DESIGN §3.4), and a ninth series in
 * the color of the first is two series indistinguishable from each other.
 * Instead, we return `--ink-3`: neutral, visibly "other", a clear signal that
 * this data can no longer be distinguished by color and must be shown
 * differently (table, filter).
 */
export function seriesColor(slot: number): string {
  if (!Number.isInteger(slot) || slot < 1 || slot > SERIES_SLOT_COUNT) {
    return "var(--ink-3)";
  }
  return `var(--series-${slot})`;
}

/* ------------------------------------------------------------------ *
 * Point scaling by rep count
 * ------------------------------------------------------------------ */

/** Point radius in px. The lower bound guards the touch target and visibility. */
export const POINT_RADIUS_MIN = 4;
export const POINT_RADIUS_MAX = 9;

/**
 * The main exercise chart scales the point by rep count (DESIGN §10 —
 * "a product requirement, not ornamentation"): 100 kg × 3 and 100 kg × 10 are
 * entirely different efforts, yet they sit on the weight axis in the same spot.
 *
 * We scale the **circle area**, not the radius. A radius linear in reps
 * exaggerates the difference quadratically — the eye reads area, so a
 * "10 reps" point would look like more than three times the effort of
 * "3 reps", instead of a little more.
 */
export function pointRadiusForReps(reps: number, minReps: number, maxReps: number): number {
  if (!Number.isFinite(reps) || reps <= 0) {
    return POINT_RADIUS_MIN;
  }
  if (maxReps <= minReps) {
    // All sets with the same rep count: none is "larger",
    // so a uniform mid-sized point instead of an arbitrary minimum.
    return (POINT_RADIUS_MIN + POINT_RADIUS_MAX) / 2;
  }
  const clamped = Math.min(Math.max(reps, minReps), maxReps);
  const position = (clamped - minReps) / (maxReps - minReps);
  const areaMin = POINT_RADIUS_MIN ** 2;
  const areaMax = POINT_RADIUS_MAX ** 2;
  return Math.sqrt(areaMin + position * (areaMax - areaMin));
}

/* ------------------------------------------------------------------ *
 * Muscle group buckets (weekly volume chart)
 * ------------------------------------------------------------------ */

/**
 * The database has 11 muscle groups, the palette has 8 slots, and wrapping
 * them is not allowed (DESIGN §3.4). The volume chart therefore uses a fixed,
 * **presentation-only** mapping — never written to the database.
 *
 * The color follows the BUCKET, not its position in the stack: a filter that
 * changes the number of visible series does not repaint the rest, so "orange"
 * always means back, regardless of what else is on the chart.
 *
 * The full 11-group breakdown is shown in the table below the chart, not by
 * adding more colors that could not be distinguished anyway.
 */
export interface MuscleGroupBucket {
  key: string;
  label: string;
  /** Palette slot, 1-8. */
  slot: number;
  /** Groups from the database that fall into this bucket. */
  groups: readonly string[];
}

export const MUSCLE_GROUP_BUCKETS: readonly MuscleGroupBucket[] = [
  { key: "klatka", label: "klatka piersiowa", slot: 1, groups: ["klatka piersiowa"] },
  { key: "plecy", label: "plecy", slot: 2, groups: ["plecy"] },
  { key: "nogi", label: "nogi", slot: 3, groups: ["nogi", "łydki"] },
  { key: "barki", label: "barki", slot: 4, groups: ["barki"] },
  { key: "ramiona", label: "ramiona", slot: 5, groups: ["biceps", "triceps", "przedramiona"] },
  { key: "posladki", label: "pośladki", slot: 6, groups: ["pośladki"] },
  { key: "brzuch", label: "brzuch", slot: 7, groups: ["brzuch"] },
  { key: "cale-cialo", label: "całe ciało", slot: 8, groups: ["całe ciało"] },
];

/**
 * Bucket for groups outside the list. A user's own exercise can have any
 * `muscleGroup` typed in by hand — throwing it into "whole body" would
 * falsify the data, and a ninth palette color does not exist. So it gets the
 * neutral `--ink-3` via `seriesColor()` (slot 9) — the same "we no longer
 * distinguish this by color" signal as the ninth series.
 */
export const OTHER_MUSCLE_BUCKET: MuscleGroupBucket = {
  key: "inne",
  label: "inne",
  slot: SERIES_SLOT_COUNT + 1,
  groups: [],
};

const BUCKET_BY_GROUP = new Map<string, MuscleGroupBucket>(
  MUSCLE_GROUP_BUCKETS.flatMap((bucket) => bucket.groups.map((group) => [group, bucket])),
);

export function bucketForMuscleGroup(muscleGroup: string): MuscleGroupBucket {
  return BUCKET_BY_GROUP.get(muscleGroup.trim().toLowerCase()) ?? OTHER_MUSCLE_BUCKET;
}

export interface BucketedVolume {
  bucket: MuscleGroupBucket;
  kg: number;
}

/**
 * A week's volume broken down into buckets, sorted by slot — the segment
 * order in the stack must be stable across weeks, otherwise the stack
 * "flickers" as the chart scrolls.
 *
 * Zero buckets are SKIPPED: a zero-height segment is not visible anyway,
 * and in the legend or table it would be noise.
 */
export function bucketWeeklyVolume(byMuscleGroup: Record<string, number>): BucketedVolume[] {
  const sums = new Map<string, { bucket: MuscleGroupBucket; kg: number }>();
  for (const [group, kg] of Object.entries(byMuscleGroup)) {
    const bucket = bucketForMuscleGroup(group);
    const current = sums.get(bucket.key);
    if (current === undefined) {
      sums.set(bucket.key, { bucket, kg });
    } else {
      current.kg += kg;
    }
  }
  return [...sums.values()]
    .filter((entry) => entry.kg > 0)
    .sort((a, b) => a.bucket.slot - b.bucket.slot);
}
