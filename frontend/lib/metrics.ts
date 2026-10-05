/**
 * lib/metrics.ts — mirror of the `metrics` package from the backend (Java,
 * ../backend/src/main/java/com/example/easygymbackend/metrics). Same rules,
 * same bounds, same edge cases. A divergence = the frontend shows a different
 * PR than the server's XLSX export, so every change here requires the same
 * change on the Java side (and vice versa).
 *
 * Everything below is pure functions: zero dependency on React/Dexie/API.
 */

import { addWeeks, getISOWeek, getISOWeekYear, startOfISOWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";

/** Time zone in which we compute days and weeks. Backend: IsoWeek.WARSAW. */
export const APP_TIME_ZONE = "Europe/Warsaw";

/** Calendar date `YYYY-MM-DD` — equivalent of java.time.LocalDate. */
export type IsoDate = string;

/* ------------------------------------------------------------------ *
 * Precision
 *
 * weight_kg is numeric(6,2) in the database. In TS we compute on double,
 * so without explicit rounding, 102.5 from the API and 102.50000000000001
 * from a local sum would produce a false "new record" (PROMPT.md §9).
 * Anything that goes into a PR comparison or on screen passes through round2.
 *
 * Java uses RoundingMode.HALF_UP, i.e. halves rounded AWAY FROM ZERO
 * (-0.005 -> -0.01). Math.round rounds halves toward +∞ (-0.5 -> -0),
 * and multiplication by 100 loses precision (1.005 * 100 = 100.49999999999999),
 * hence shifting the decimal point via the exponent, not by multiplication.
 * ------------------------------------------------------------------ */

function shiftDecimalPoint(value: number, places: number): number {
  const [mantissa, exponent] = value.toExponential().split("e");
  return Number(`${mantissa}e${Number(exponent) + places}`);
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const shifted = shiftDecimalPoint(value, 2);
  const rounded = Math.sign(shifted) * Math.round(Math.abs(shifted));
  return shiftDecimalPoint(rounded, -2);
}

/* ------------------------------------------------------------------ *
 * Set and e1RM
 * ------------------------------------------------------------------ */

export type OneRepMaxFormula = "epley" | "brzycki";

/** Input to every function in this file. Mirror of the ExerciseSet record in Java. */
export interface ExerciseSet {
  setId: string;
  /** ISO 8601 with offset/Z — the moment the set was confirmed. */
  completedAt: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  toFailure: boolean;
  assisted: boolean;
}

const BRZYCKI_MAX_VALID_REPS = 36;

/**
 * e1RM by Epley (`weight × (1 + reps/30)`) or Brzycki
 * (`weight × 36 / (37 − reps)`). For reps = 1 both return the weight itself.
 *
 * Brzycki divides by zero at reps = 37 and returns negative nonsense above —
 * realistic with bodyweight + to_failure (40 push-ups). We return `null`,
 * never a number; the backend returns Optional.empty() here.
 */
export function estimate1RM(
  weightKg: number,
  reps: number,
  formula: OneRepMaxFormula,
): number | null {
  if (reps === 1) {
    return round2(weightKg);
  }
  if (formula === "epley") {
    return round2(weightKg * (1 + reps / 30));
  }
  if (reps > BRZYCKI_MAX_VALID_REPS) {
    return null;
  }
  return round2((weightKg * 36) / (37 - reps));
}

/* ------------------------------------------------------------------ *
 * Rep ranges
 * ------------------------------------------------------------------ */

export const REP_RANGE_BUCKETS = ["1", "2-3", "4-6", "7-10", "11-15", "15+"] as const;

export type RepRangeBucket = (typeof REP_RANGE_BUCKETS)[number];

export function repRangeBucket(reps: number): RepRangeBucket {
  if (reps === 1) return "1";
  if (reps <= 3) return "2-3";
  if (reps <= 6) return "4-6";
  if (reps <= 10) return "7-10";
  if (reps <= 15) return "11-15";
  return "15+";
}

/* ------------------------------------------------------------------ *
 * Session metrics
 * ------------------------------------------------------------------ */

function workingSets(sets: readonly ExerciseSet[]): ExerciseSet[] {
  return sets.filter((set) => !set.isWarmup);
}

function sumVolume(sets: readonly ExerciseSet[]): number {
  return round2(sets.reduce((total, set) => total + set.weightKg * set.reps, 0));
}

/**
 * Session volume FOR DISPLAY to the user: working sets, **including
 * assisted** (work physically performed). This is a different number than
 * {@link prEligibleVolumeKg} — and that is intentional, see the comment there.
 */
export function displayVolumeKg(sets: readonly ExerciseSet[]): number {
  return sumVolume(workingSets(sets));
}

/**
 * Volume for the PR "largest session volume": working sets **excluding
 * assisted**. Two separate named functions instead of one with a flag, so
 * that one cannot be silently confused with the other.
 */
export function prEligibleVolumeKg(sets: readonly ExerciseSet[]): number {
  return sumVolume(workingSets(sets).filter((set) => !set.assisted));
}

/** Heaviest set: max weight among working non-assisted sets, tie → more reps. */
export function heaviestSet(sets: readonly ExerciseSet[]): ExerciseSet | null {
  const candidates = workingSets(sets).filter((set) => !set.assisted);
  let best: ExerciseSet | null = null;
  for (const set of candidates) {
    if (best === null) {
      best = set;
      continue;
    }
    const weightDiff = round2(set.weightKg) - round2(best.weightKg);
    if (weightDiff > 0 || (weightDiff === 0 && set.reps > best.reps)) {
      best = set;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Personal records (PR)
 * ------------------------------------------------------------------ */

export interface PersonalRecordEntry {
  setId: string;
  value: number;
}

export interface SessionVolumeRecord {
  workoutId: string;
  value: number;
}

export interface PersonalRecords {
  maxWeight: PersonalRecordEntry | null;
  maxE1rm: PersonalRecordEntry | null;
  maxSessionVolume: SessionVolumeRecord | null;
  byRepRange: Partial<Record<RepRangeBucket, PersonalRecordEntry>>;
}

/** One workout session for one exercise, in chronological order. */
export interface WorkoutSession {
  workoutId: string;
  sets: ExerciseSet[];
}

export function emptyPersonalRecords(): PersonalRecords {
  return { maxWeight: null, maxE1rm: null, maxSessionVolume: null, byRepRange: {} };
}

/**
 * The state of records after walking through all sessions. Sessions MUST be
 * in chronological order: on a tie the record stays with the first occurrence,
 * because beating is strictly `>`, never `>=`.
 */
export function computePersonalRecords(
  chronologicalSessions: readonly WorkoutSession[],
  formula: OneRepMaxFormula,
): PersonalRecords {
  const records = emptyPersonalRecords();

  for (const session of chronologicalSessions) {
    const sessionVolume = prEligibleVolumeKg(session.sets);
    if (records.maxSessionVolume === null || sessionVolume > records.maxSessionVolume.value) {
      records.maxSessionVolume = { workoutId: session.workoutId, value: sessionVolume };
    }

    for (const set of session.sets) {
      if (set.isWarmup || set.assisted) {
        continue;
      }

      const weight = round2(set.weightKg);
      if (records.maxWeight === null || weight > records.maxWeight.value) {
        records.maxWeight = { setId: set.setId, value: weight };
      }

      const e1rm = estimate1RM(set.weightKg, set.reps, formula);
      if (e1rm !== null && (records.maxE1rm === null || e1rm > records.maxE1rm.value)) {
        records.maxE1rm = { setId: set.setId, value: e1rm };
      }

      const bucket = repRangeBucket(set.reps);
      const currentBucketRecord = records.byRepRange[bucket];
      if (currentBucketRecord === undefined || weight > currentBucketRecord.value) {
        records.byRepRange[bucket] = { setId: set.setId, value: weight };
      }
    }
  }

  return records;
}

/**
 * Records broken by the LAST session in the list — feeds the "PR broken"
 * banner on the workout summary and the "is PR" column in the export. This
 * is not the same as "is a global maximum": what matters is whether the
 * record fell AT THE MOMENT it was performed. Same algorithm as
 * {@link computePersonalRecords}, so the rules cannot diverge between the
 * screen and the export.
 */
export function personalRecordsBrokenIn(
  chronologicalSessions: readonly WorkoutSession[],
  formula: OneRepMaxFormula,
): PersonalRecords {
  if (chronologicalSessions.length === 0) {
    return emptyPersonalRecords();
  }

  const latest = chronologicalSessions[chronologicalSessions.length - 1];
  const after = computePersonalRecords(chronologicalSessions, formula);
  const latestSetIds = new Set(latest.sets.map((set) => set.setId));

  const byRepRange: Partial<Record<RepRangeBucket, PersonalRecordEntry>> = {};
  for (const bucket of REP_RANGE_BUCKETS) {
    const entry = after.byRepRange[bucket];
    if (entry !== undefined && latestSetIds.has(entry.setId)) {
      byRepRange[bucket] = entry;
    }
  }

  return {
    maxWeight:
      after.maxWeight !== null && latestSetIds.has(after.maxWeight.setId) ? after.maxWeight : null,
    maxE1rm:
      after.maxE1rm !== null && latestSetIds.has(after.maxE1rm.setId) ? after.maxE1rm : null,
    maxSessionVolume:
      after.maxSessionVolume !== null && after.maxSessionVolume.workoutId === latest.workoutId
        ? after.maxSessionVolume
        : null,
    byRepRange,
  };
}

/* ------------------------------------------------------------------ *
 * ISO-8601 week
 *
 * Monday → Sunday, zone Europe/Warsaw. Computed via date-fns
 * (getISOWeek / startOfISOWeek), never by hand-rolled arithmetic on getDay()
 * — week 53 and year boundaries break every "by hand" version.
 * ------------------------------------------------------------------ */

export interface IsoWeek {
  year: number;
  week: number;
}

/**
 * Calendar date as a Date in the *browser's* time zone. The ISO week number
 * depends only on the calendar day, so as long as we don't cross a day
 * boundary (and we don't — we build from ready y/m/d), the host time zone is
 * irrelevant. Instants pass through warsawCalendarDate first.
 */
function calendarDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function parseIsoDate(date: IsoDate): Date {
  const [year, month, day] = date.split("-").map(Number);
  return calendarDate(year, month, day);
}

export function formatIsoDate(date: Date): IsoDate {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The calendar day on which the given instant fell in Warsaw. */
export function warsawCalendarDate(instant: Date | string | number): IsoDate {
  const zoned = new TZDate(new Date(instant).getTime(), APP_TIME_ZONE);
  return formatIsoDate(calendarDate(zoned.getFullYear(), zoned.getMonth() + 1, zoned.getDate()));
}

export function isoWeekOfDate(date: IsoDate): IsoWeek {
  const parsed = parseIsoDate(date);
  return { year: getISOWeekYear(parsed), week: getISOWeek(parsed) };
}

/**
 * ISO week for an instant in time (e.g. `workouts.started_at`) — always by
 * Warsaw date, not UTC. A session ending after midnight must not straddle
 * two weeks.
 */
export function isoWeekOfInstant(instant: Date | string | number): IsoWeek {
  return isoWeekOfDate(warsawCalendarDate(instant));
}

/** Monday of the given week. ISO-8601 anchor: January 4 always lies in week 1. */
export function isoWeekMondayStart(week: IsoWeek): IsoDate {
  const anchor = startOfISOWeek(calendarDate(week.year, 1, 4));
  return formatIsoDate(addWeeks(anchor, week.week - 1));
}

export function isoWeekSundayEnd(week: IsoWeek): IsoDate {
  const monday = parseIsoDate(isoWeekMondayStart(week));
  monday.setDate(monday.getDate() + 6);
  return formatIsoDate(monday);
}

export function compareIsoWeeks(a: IsoWeek, b: IsoWeek): number {
  return a.year !== b.year ? a.year - b.year : a.week - b.week;
}

export function isoWeeksEqual(a: IsoWeek, b: IsoWeek): boolean {
  return a.year === b.year && a.week === b.week;
}

export function isoWeekKey(week: IsoWeek): string {
  return `${week.year}-W${String(week.week).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Body weight
 * ------------------------------------------------------------------ */

export interface BodyWeightEntry {
  measuredOn: IsoDate;
  weightKg: number;
}

export interface WeeklyBodyWeightAverage {
  week: IsoWeek;
  measurementCount: number;
  averageKg: number;
  /** Fewer than 2 measurements — we show it, but mark it visually. */
  incomplete: boolean;
}

export function weeklyAverages(
  entries: readonly BodyWeightEntry[],
): WeeklyBodyWeightAverage[] {
  const byWeek = new Map<string, { week: IsoWeek; values: number[] }>();

  for (const entry of entries) {
    const week = isoWeekOfDate(entry.measuredOn);
    const key = isoWeekKey(week);
    const bucket = byWeek.get(key);
    if (bucket === undefined) {
      byWeek.set(key, { week, values: [entry.weightKg] });
    } else {
      bucket.values.push(entry.weightKg);
    }
  }

  return [...byWeek.values()]
    .map(({ week, values }) => ({
      week,
      measurementCount: values.length,
      averageKg: round2(values.reduce((sum, value) => sum + value, 0) / values.length),
      incomplete: values.length < 2,
    }))
    .sort((a, b) => compareIsoWeeks(a.week, b.week));
}

function indexOfWeek(weeks: readonly WeeklyBodyWeightAverage[], target: IsoWeek): number {
  return weeks.findIndex((candidate) => isoWeeksEqual(candidate.week, target));
}

export function weekOverWeekDeltaKg(
  chronologicalWeeks: readonly WeeklyBodyWeightAverage[],
  targetWeek: IsoWeek,
): number | null {
  const index = indexOfWeek(chronologicalWeeks, targetWeek);
  if (index <= 0) {
    return null;
  }
  return round2(chronologicalWeeks[index].averageKg - chronologicalWeeks[index - 1].averageKg);
}

export function weekOverWeekDeltaPercent(
  chronologicalWeeks: readonly WeeklyBodyWeightAverage[],
  targetWeek: IsoWeek,
): number | null {
  const index = indexOfWeek(chronologicalWeeks, targetWeek);
  if (index <= 0) {
    return null;
  }
  const previous = chronologicalWeeks[index - 1].averageKg;
  if (previous === 0) {
    return null;
  }
  return round2(((chronologicalWeeks[index].averageKg - previous) / previous) * 100);
}

/**
 * 7-day rolling average per measurement day — a separate series on the chart,
 * next to the thick line of weekly averages. The window is computed over
 * measurements that actually exist (days without a weigh-in are not zeros).
 */
export function sevenDayRollingAverage(
  entries: readonly BodyWeightEntry[],
): Map<IsoDate, number> {
  const byDate = new Map<IsoDate, number>();
  for (const entry of entries) {
    // Duplicate day: last entry wins (the database keeps one live row per day anyway).
    byDate.set(entry.measuredOn, entry.weightKg);
  }

  const result = new Map<IsoDate, number>();
  for (const date of [...byDate.keys()].sort()) {
    const windowStart = parseIsoDate(date);
    windowStart.setDate(windowStart.getDate() - 6);
    const windowStartKey = formatIsoDate(windowStart);

    const values = [...byDate.entries()]
      .filter(([day]) => day >= windowStartKey && day <= date)
      .map(([, value]) => value);

    result.set(date, round2(values.reduce((sum, value) => sum + value, 0) / values.length));
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Week-over-week trend
 * ------------------------------------------------------------------ */

export interface WeeklyValue {
  week: IsoWeek;
  value: number;
  isDeload: boolean;
}

export interface TrendResult {
  previousValue: number;
  currentValue: number;
  deltaPercent: number;
}

/**
 * Compare a week to its predecessor. By default (`includeDeload = false`)
 * deload weeks disappear from the chain entirely — the week after a deload
 * is compared to the last non-deload week BEFORE it, not to the deload
 * itself (otherwise the return to normal looks like +162% form).
 */
export function compareToPreviousWeek(
  chronologicalWeeks: readonly WeeklyValue[],
  targetWeek: IsoWeek,
  includeDeload = false,
): TrendResult | null {
  const relevant = includeDeload
    ? [...chronologicalWeeks]
    : chronologicalWeeks.filter((week) => !week.isDeload);

  const targetIndex = relevant.findIndex((week) => isoWeeksEqual(week.week, targetWeek));
  if (targetIndex <= 0) {
    return null;
  }

  const previousValue = relevant[targetIndex - 1].value;
  const currentValue = relevant[targetIndex].value;
  if (previousValue === 0) {
    return null;
  }

  return {
    previousValue,
    currentValue,
    deltaPercent: round2(((currentValue - previousValue) / previousValue) * 100),
  };
}
