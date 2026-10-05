import type { WorkoutDayResponse } from "@/types/api";

/**
 * Workout calendar grid: ISO weeks as columns, days of the week as rows
 * (Monday on top) — an activity-grid layout, because at 390 px that is the
 * only way to show a quarter without scrolling.
 *
 * Pure function: takes server days and the range, returns a finished grid.
 * The component does not compute dates, because calendar arithmetic in JSX
 * hides bugs that stay invisible until the year boundary.
 */

export interface CalendarCell {
  /** `YYYY-MM-DD`. Cells padding the week also have a date — the fact they
   *  are outside the range is marked by `outside`, not by a missing date. */
  date: string;
  workoutCount: number;
  /** Outside the `from`–`to` range (e.g. days after today). */
  outside: boolean;
}

export interface CalendarGrid {
  /** Columns = successive weeks, each 7 cells (Mon → Sun). */
  weeks: CalendarCell[][];
  /** Month labels to annotate columns: week index → name. */
  monthLabels: { weekIndex: number; label: string }[];
  maxCount: number;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDay(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  // Noon, not midnight — on a DST shift midnight can land in the previous
  // day. Same convention as in `lib/bodyweight/points.ts`.
  return new Date(year, month - 1, day, 12);
}

/** Monday of the week containing `date`. */
function mondayOf(date: Date): Date {
  const result = new Date(date);
  // `getDay()`: 0 = Sunday. Without this adjustment Sunday would land at
  // the start of the NEXT week, whereas this project uses ISO weeks
  // (Mon–Sun).
  const shift = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - shift);
  return result;
}

export function buildCalendar(
  days: readonly WorkoutDayResponse[],
  fromIso: string,
  toIso: string,
): CalendarGrid {
  const counts = new Map(days.map((day) => [day.date, day.workoutCount]));
  const start = mondayOf(parseDay(fromIso));

  const weeks: CalendarCell[][] = [];
  const monthLabels: { weekIndex: number; label: string }[] = [];
  let maxCount = 0;
  let lastMonth = -1;

  // The cursor walks by calendar DAYS (`setDate`), and range membership is
  // decided by comparing dates as text — never by millisecond arithmetic.
  // Adding a hard 24 h loses an hour at a DST transition (March 29), which
  // moved the cursor from noon to 13:00 and dropped the LAST day of the
  // range "outside": in a calendar spanning March and September, today's
  // day disappeared along with any workouts logged on it.
  const cursor = new Date(start);
  while (toIsoDate(cursor) <= toIso) {
    const cells: CalendarCell[] = [];
    const weekIndex = weeks.length;

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const iso = toIsoDate(cursor);
      const outside = iso < fromIso || iso > toIso;
      const count = outside ? 0 : (counts.get(iso) ?? 0);
      maxCount = Math.max(maxCount, count);
      cells.push({ date: iso, workoutCount: count, outside });

      if (dayOfWeek === 0 && cursor.getMonth() !== lastMonth) {
        lastMonth = cursor.getMonth();
        monthLabels.push({
          weekIndex,
          label: cursor.toLocaleDateString("pl-PL", { month: "short" }),
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(cells);
  }

  return { weeks, monthLabels, maxCount };
}

/**
 * Cell intensity, 0–1. We scale to `maxCount`, not to a fixed threshold:
 * someone training once a day and someone training twice should both get a
 * legible grid, not "all pale" and "all full" respectively.
 */
export function cellIntensity(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) {
    return 0;
  }
  return Math.min(1, 0.35 + (0.65 * count) / maxCount);
}
