"use client";

import type { ReactNode } from "react";

/**
 * Shared chart chrome: axes, margins, date formats and the tooltip box.
 * Extracted because the exercise screen and the weight screen must look
 * like one system, not two charts built separately — a second copy of
 * these constants would drift away at the first axis-width tweak.
 */

/** Axis chrome — colors from theme tokens, never from a series color (DESIGN §10). */
export const AXIS_PROPS = {
  stroke: "var(--chart-axis)",
  tick: { fill: "var(--chart-axis)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

// No negative left margin. Pulling the chart under the Y axis recovers a
// dozen pixels of width but clips axis labels — and a clipped number on
// the axis is worse than a missing one: "108 kg" clipped to "08 kg" reads
// as data.
export const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

/** Y-axis width sized for the longest label that can appear here. */
export const Y_AXIS_WIDTH = 56;

export function formatDayMonth(value: number): string {
  return new Date(value).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
}

export function formatFullDate(value: number): string {
  return new Date(value).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function timeAxis(points: readonly { t: number }[]) {
  return {
    dataKey: "t" as const,
    type: "number" as const,
    // A single point would give a degenerate domain [x, x] and Recharts
    // would draw the axis without ticks — spread it by one day each way.
    domain:
      points.length === 1
        ? [points[0].t - 86_400_000, points[0].t + 86_400_000]
        : (["dataMin", "dataMax"] as const),
    tickFormatter: formatDayMonth,
    minTickGap: 28,
  };
}

/**
 * Time axis for bars. A bar is drawn around its point, so the first and
 * last ones overflow the domain and run into the Y-axis labels. We spread
 * the domain by half the inter-point gap on each side.
 */
export function barTimeAxis(points: readonly { t: number }[]) {
  const axis = timeAxis(points);
  if (points.length < 2) {
    return axis;
  }
  const min = points[0].t;
  const max = points[points.length - 1].t;
  const pad = (max - min) / (points.length - 1) / 1.6;
  return { ...axis, domain: [min - pad, max + pad] };
}

export function TooltipBox({ title, lines }: { title: string; lines: ReactNode[] }) {
  return (
    <div className="rounded-control border border-hairline bg-surface-2 px-3 py-2 shadow-lg">
      <p className="meta">{title}</p>
      {lines.map((line, index) => (
        <p key={index} className="text-[13px] font-semibold tabular-nums text-ink">
          {line}
        </p>
      ))}
    </div>
  );
}

/** Shape in which Recharts calls the tooltip `content`. Their `payload`
 *  is `readonly` — without that modifier TS rejects the whole function. */
export interface TooltipPayload<T> {
  active?: boolean;
  payload?: readonly { payload?: T }[];
}
