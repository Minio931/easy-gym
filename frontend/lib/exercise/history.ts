import type { ExerciseHistoryResponse, ExerciseHistorySessionResponse } from "@/types/api";

/**
 * Converting `GET /api/exercises/{id}/history` into chart points.
 * Pure functions — chart components get ready numbers and only draw.
 *
 * Shared rule: **a session without a given value yields no point**, instead
 * of yielding zero. A workout made of warmups only has `heaviestSet: null`,
 * and a zero on the weight chart would look like a form crash that never
 * happened.
 */

/** `t` is in milliseconds — the X axis is numeric so inter-session gaps are
 *  proportional to the breaks. A categorical axis draws a month-long break
 *  the same as a day and lies about the pace of progress. */
interface ChartPointBase {
  t: number;
  workoutId: string;
  startedAt: string;
  isDeload: boolean;
}

export interface WeightPoint extends ChartPointBase {
  weightKg: number;
  reps: number;
  rpe: number | null;
}

export interface E1rmPoint extends ChartPointBase {
  e1rmKg: number;
}

export interface VolumePoint extends ChartPointBase {
  volumeKg: number;
}

function base(session: ExerciseHistorySessionResponse): ChartPointBase {
  return {
    t: Date.parse(session.startedAt),
    workoutId: session.workoutId,
    startedAt: session.startedAt,
    isDeload: session.isDeload,
  };
}

/**
 * Main chart: weight of the heaviest working set over time (DESIGN §10).
 * `heaviestSet` is computed by the server and **excludes warmups** — we do
 * not repeat the rule here, so it cannot drift from the backend.
 */
export function weightProgressPoints(
  sessions: readonly ExerciseHistorySessionResponse[],
): WeightPoint[] {
  const points: WeightPoint[] = [];
  for (const session of sessions) {
    const set = session.heaviestSet;
    if (set === null) {
      continue;
    }
    points.push({ ...base(session), weightKg: set.weightKg, reps: set.reps, rpe: set.rpe });
  }
  return points;
}

/** e1RM over time. `null` (Brzycki above 36 reps) is skipped, not zeroed. */
export function e1rmPoints(sessions: readonly ExerciseHistorySessionResponse[]): E1rmPoint[] {
  const points: E1rmPoint[] = [];
  for (const session of sessions) {
    if (session.bestE1rmKg === null) {
      continue;
    }
    points.push({ ...base(session), e1rmKg: session.bestE1rmKg });
  }
  return points;
}

/**
 * Volume per session. We take `displayVolumeKg` (with `assisted`), because
 * that is the "how much work I did" number, not a tracking number for
 * records — the latter (`prEligibleVolumeKg`) belongs to PRs and stays there.
 *
 * Here zero IS a real value: a session with warmups only has zero working
 * volume and that is how it looks in reality.
 */
export function volumePoints(
  sessions: readonly ExerciseHistorySessionResponse[],
): VolumePoint[] {
  return sessions.map((session) => ({ ...base(session), volumeKg: session.displayVolumeKg }));
}

/** Range of reps in a set of points — used to scale point size. */
export function repsExtent(points: readonly WeightPoint[]): { min: number; max: number } {
  if (points.length === 0) {
    return { min: 1, max: 1 };
  }
  let min = points[0].reps;
  let max = points[0].reps;
  for (const point of points) {
    min = Math.min(min, point.reps);
    max = Math.max(max, point.reps);
  }
  return { min, max };
}

/**
 * Screen header: the latest value of each series, to show in a tile.
 * `null` when the selected range has no point at all — the tile then shows
 * an empty state instead of a dash masquerading as a number.
 */
export function latestValue<T>(points: readonly T[], value: (point: T) => number): number | null {
  const last = points.at(-1);
  return last === undefined ? null : value(last);
}

/** Does the exercise have any trace in history (for the empty-screen state). */
export function hasAnyHistory(history: ExerciseHistoryResponse): boolean {
  return history.sessions.length > 0;
}
