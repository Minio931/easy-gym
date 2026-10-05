"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_PROPS,
  MARGIN,
  TooltipBox,
  Y_AXIS_WIDTH,
  barTimeAxis,
  formatFullDate,
  timeAxis,
  type TooltipPayload,
} from "@/components/charts/chrome";
import { pointRadiusForReps, seriesColor } from "@/lib/charts";
import { repsExtent, type E1rmPoint, type VolumePoint, type WeightPoint } from "@/lib/exercise/history";
import { formatVolume, formatWeight } from "@/lib/format";

/**
 * Exercise-screen charts. Three separate tiles, each with **one Y axis** —
 * weight, e1RM and volume have entirely different scales, and two scales
 * on one chart is a chart from which nothing can be read (DESIGN §10).
 *
 * All three use palette slot 1. That is not an oversight: each chart has
 * one series, so color distinguishes nothing here, and three different
 * colors would suggest encoding that does not exist. Identity is carried
 * by the tile title.
 *
 * Deload is not shown via point shape — DESIGN reserves the empty
 * outlined point for an incomplete week on the weight chart, and
 * replicating that here would give one symbol two meanings. Deload is
 * visible in the tooltip and the table.
 */

const SERIES = seriesColor(1);

/**
 * Volume on the axis: kilograms with a thousands separator, ALWAYS the
 * same unit. Shortening only large values to tons gave an axis where
 * "1.6 t" sat next to "800" — two units on one scale.
 */
function formatVolumeTick(value: number): string {
  return value.toLocaleString("pl-PL");
}

/* ------------------------------------------------------------------ *
 * 1. Weight progression — main exercise chart
 * ------------------------------------------------------------------ */

export function WeightProgressChart({ points }: { points: readonly WeightPoint[] }) {
  const extent = repsExtent(points);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={[...points]} margin={MARGIN}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis {...AXIS_PROPS} {...timeAxis(points)} />
        <YAxis {...AXIS_PROPS} width={Y_AXIS_WIDTH} domain={["auto", "auto"]} unit=" kg" />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }}
          content={({ active, payload }: TooltipPayload<WeightPoint>) => {
            const point = active === true ? payload?.[0]?.payload : undefined;
            if (point === undefined) {
              return null;
            }
            // Format mandated by DESIGN §10: "102.5 kg × 5 @RPE 8".
            const rpe = point.rpe === null ? "" : ` @RPE ${point.rpe}`;
            return (
              <TooltipBox
                title={formatFullDate(point.t) + (point.isDeload ? " · deload" : "")}
                lines={[`${formatWeight(point.weightKg)} × ${point.reps}${rpe}`]}
              />
            );
          }}
        />
        <Line
          type="linear"
          dataKey="weightKg"
          stroke={SERIES}
          strokeWidth={2}
          isAnimationActive={false}
          activeDot={{ r: 6, fill: SERIES, stroke: "var(--surface)", strokeWidth: 2 }}
          dot={(props: { cx?: number; cy?: number; payload?: WeightPoint; index?: number }) => {
            const { cx, cy, payload, index } = props;
            if (cx === undefined || cy === undefined || payload === undefined) {
              return <g key={`empty-${String(index)}`} />;
            }
            return (
              <circle
                key={payload.workoutId}
                cx={cx}
                cy={cy}
                // Point size carries rep count — 100 kg × 3 and 100 kg × 10
                // sit at the same axis height, yet they are different efforts.
                r={pointRadiusForReps(payload.reps, extent.min, extent.max)}
                fill={SERIES}
              />
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 * 2. e1RM over time
 * ------------------------------------------------------------------ */

export function E1rmChart({ points }: { points: readonly E1rmPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={[...points]} margin={MARGIN}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis {...AXIS_PROPS} {...timeAxis(points)} />
        <YAxis {...AXIS_PROPS} width={Y_AXIS_WIDTH} domain={["auto", "auto"]} unit=" kg" />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }}
          content={({ active, payload }: TooltipPayload<E1rmPoint>) => {
            const point = active === true ? payload?.[0]?.payload : undefined;
            if (point === undefined) {
              return null;
            }
            return (
              <TooltipBox
                title={formatFullDate(point.t) + (point.isDeload ? " · deload" : "")}
                lines={[`${formatWeight(point.e1rmKg)} e1RM`]}
              />
            );
          }}
        />
        <Line
          type="linear"
          dataKey="e1rmKg"
          stroke={SERIES}
          strokeWidth={2}
          isAnimationActive={false}
          dot={{ r: 4, fill: SERIES }}
          activeDot={{ r: 6, fill: SERIES, stroke: "var(--surface)", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 * 3. Session volume
 * ------------------------------------------------------------------ */

export function SessionVolumeChart({ points }: { points: readonly VolumePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...points]} margin={MARGIN}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis {...AXIS_PROPS} {...barTimeAxis(points)} />
        <YAxis {...AXIS_PROPS} width={Y_AXIS_WIDTH} tickFormatter={formatVolumeTick} />
        <Tooltip
          cursor={{ fill: "var(--chart-grid)" }}
          content={({ active, payload }: TooltipPayload<VolumePoint>) => {
            const point = active === true ? payload?.[0]?.payload : undefined;
            if (point === undefined) {
              return null;
            }
            return (
              <TooltipBox
                title={formatFullDate(point.t) + (point.isDeload ? " · deload" : "")}
                lines={[`${formatVolume(point.volumeKg)} kg`]}
              />
            );
          }}
        />
        <Bar dataKey="volumeKg" fill={SERIES} radius={4} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
