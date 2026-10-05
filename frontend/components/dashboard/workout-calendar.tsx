"use client";

import { useEffect, useRef } from "react";
import { cellIntensity, type CalendarCell, type CalendarGrid } from "@/lib/dashboard/calendar";
import { pluralPl } from "@/lib/format";

/**
 * Workout calendar: weeks as columns, days of the week as rows. At
 * 390 px this is the only layout where half a year fits without
 * vertical scrolling — a classic monthly grid would eat six screens.
 *
 * `lib/dashboard/calendar.ts` builds the grid; only dimensions and
 * colors live here.
 */

const CELL = 12;
const GAP = 3;
const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
/** Label every other day — seven labels on a 12 px cell is a wall. */
const LABELLED_WEEKDAYS = [0, 2, 4];

export function WorkoutCalendar({
  grid,
  totalWorkouts,
}: {
  grid: CalendarGrid;
  totalWorkouts: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The newest week is on the right and that is what the viewer cares
    // about — a calendar opened on March would need scrolling to see "today".
    const element = scroller.current;
    if (element !== null) {
      element.scrollLeft = element.scrollWidth;
    }
  }, [grid]);

  const label = `Kalendarz treningów: ${String(totalWorkouts)} ${pluralPl(
    totalWorkouts,
    "trening",
    "treningi",
    "treningów",
  )} w ${String(grid.weeks.length)} ${pluralPl(
    grid.weeks.length,
    "tygodniu",
    "tygodniach",
    "tygodniach",
  )}.`;

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="flex gap-2">
        <div
          className="shrink-0 pt-[18px]"
          style={{ display: "grid", gap: GAP, gridTemplateRows: `repeat(7, ${CELL}px)` }}
          aria-hidden="true"
        >
          {WEEKDAYS.map((day, index) => (
            <span key={day} className="meta" style={{ fontSize: 10, lineHeight: `${CELL}px` }}>
              {LABELLED_WEEKDAYS.includes(index) ? day : ""}
            </span>
          ))}
        </div>

        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
          <div role="img" aria-label={label} style={{ width: "max-content" }}>
            <div
              className="relative mb-1 h-[14px]"
              style={{ width: grid.weeks.length * (CELL + GAP) }}
              aria-hidden="true"
            >
              {grid.monthLabels.map((month) => (
                <span
                  key={`${String(month.weekIndex)}-${month.label}`}
                  className="meta absolute top-0 leading-none"
                  style={{ left: month.weekIndex * (CELL + GAP), fontSize: 10 }}
                >
                  {month.label}
                </span>
              ))}
            </div>

            <div style={{ display: "grid", gridAutoFlow: "column", gap: GAP }}>
              {grid.weeks.map((week) => (
                <div
                  key={week[0].date}
                  style={{ display: "grid", gap: GAP, gridTemplateRows: `repeat(7, ${CELL}px)` }}
                >
                  {week.map((cell) => (
                    <Cell key={cell.date} cell={cell} maxCount={grid.maxCount} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({ cell, maxCount }: { cell: CalendarCell; maxCount: number }) {
  const intensity = cell.outside ? 0 : cellIntensity(cell.workoutCount, maxCount);

  return (
    <div
      // `title` is a mouse tooltip; the whole grid's `aria-label`
      // carries the content for the reader — 180 separately navigable
      // cells would be worse than one summary sentence.
      title={
        cell.outside ? undefined : `${formatCellDate(cell.date)}: ${cellText(cell.workoutCount)}`
      }
      className="rounded-[3px]"
      style={{
        width: CELL,
        height: CELL,
        // A day outside the range is transparent, a day without a
        // workout has a surface — an empty calendar should look like a
        // calendar, not like missing data.
        background: cell.outside
          ? "transparent"
          : intensity === 0
            ? "var(--surface-2)"
            : `color-mix(in srgb, var(--series-1) ${String(Math.round(intensity * 100))}%, var(--surface-2))`,
      }}
    />
  );
}

function cellText(count: number): string {
  return count === 0
    ? "bez treningu"
    : `${String(count)} ${pluralPl(count, "trening", "treningi", "treningów")}`;
}

function formatCellDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
  });
}
