"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_PROPS,
  MARGIN,
  TooltipBox,
  formatDayMonth,
  formatFullDate,
  type TooltipPayload,
} from "@/components/charts/chrome";
import { seriesColor } from "@/lib/charts";
import type { RawWeightPoint, WeeklyWeightPoint } from "@/lib/bodyweight/points";
import { formatWeight } from "@/lib/format";

/**
 * Body-weight chart, exactly per DESIGN §10:
 * raw measurements as bright 8 px points in `--ink-3`, weekly averages as
 * a 2 px line ON TOP, and an incomplete week (< 2 measurements) as an
 * empty point outlined in `--warning`.
 *
 * Two series on one Y axis are correct here — it is the same quantity in
 * the same kilograms. The "one Y axis" rule forbids two SCALES, not two
 * series.
 *
 * JSX order is paint order: `Scatter` before `Line`, so the average line
 * sits on top of the measurement cloud, not under it.
 */

const SERIES = seriesColor(1);
const RAW_RADIUS = 4; // 8 px diameter
const HIT_RADIUS = 16; // 32 px diameter — real touch target, the dot stays small

export function BodyWeightChart({
  raw,
  weekly,
  domain,
  selectedDate = null,
  onSelectDay,
}: {
  raw: readonly RawWeightPoint[];
  weekly: readonly WeeklyWeightPoint[];
  domain: [number, number] | null;
  /** The day currently selected in the entry form — outlined on the chart. */
  selectedDate?: string | null;
  /** Click/tap on a raw measurement — sets that day in the entry form. */
  onSelectDay?: (isoDate: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={MARGIN}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          {...AXIS_PROPS}
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={formatDayMonth}
          minTickGap={28}
          // Both series have their own `data`, so the axis must know the
          // same `t` values can repeat across series.
          allowDuplicatedCategory={false}
        />
        {/* No `unit` on ticks: body weight has a decimal part, so
            "84.6 kg" does not fit the axis width and Recharts breaks the
            label into two lines. The unit is carried by the tile header
            and the tooltip — and a narrower axis is a wider chart. */}
        <YAxis
          {...AXIS_PROPS}
          width={44}
          domain={domain ?? ["auto", "auto"]}
          allowDecimals
        />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }}
          content={({ active, payload }: TooltipPayload<RawWeightPoint | WeeklyWeightPoint>) => {
            if (active !== true) {
              return null;
            }
            const points = (payload ?? [])
              .map((item) => item.payload)
              .filter((point): point is RawWeightPoint | WeeklyWeightPoint => point !== undefined);
            const first = points[0];
            if (first === undefined) {
              return null;
            }
            return (
              <TooltipBox
                title={formatFullDate(first.t)}
                lines={points.map((point) =>
                  "averageKg" in point
                    ? `Średnia tyg. ${formatWeight(point.averageKg)} kg (${String(point.measurementCount)} pom.)`
                    : `${formatWeight(point.weightKg)} kg`,
                )}
              />
            );
          }}
        />

        {/* Raw measurements: bright, muted — they are background for the
            trend, not the content. Clickable (if `onSelectDay` is given) —
            the only way to pick a specific day mid-week without
            click-stepping the native `<input type="date">` day by day. The
            visible dot stays 8 px (RAW_RADIUS), but the hit area is bigger
            and invisible — such a small target cannot be hit by finger,
            and enlarging the visible point would turn the measurement
            cloud into an illegible smudge. */}
        <Scatter
          data={[...raw]}
          dataKey="weightKg"
          fill="var(--ink-3)"
          shape={(props: { cx?: number; cy?: number; payload?: RawWeightPoint }) => {
            const { cx, cy, payload } = props;
            if (cx === undefined || cy === undefined || payload === undefined) {
              return <g />;
            }
            const isSelected = payload.measuredOn === selectedDate;
            return (
              <g
                onClick={() => onSelectDay?.(payload.measuredOn)}
                style={{ cursor: onSelectDay === undefined ? undefined : "pointer" }}
              >
                {onSelectDay !== undefined && (
                  <circle cx={cx} cy={cy} r={HIT_RADIUS} fill="transparent" />
                )}
                {isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={RAW_RADIUS + 3}
                    fill="none"
                    stroke={SERIES}
                    strokeWidth={2}
                  />
                )}
                <circle cx={cx} cy={cy} r={RAW_RADIUS} fill="var(--ink-3)" />
              </g>
            );
          }}
          isAnimationActive={false}
        />

        <Line
          data={[...weekly]}
          type="linear"
          dataKey="averageKg"
          stroke={SERIES}
          strokeWidth={2}
          isAnimationActive={false}
          activeDot={{ r: 6, fill: SERIES, stroke: "var(--surface)", strokeWidth: 2 }}
          dot={(props: { cx?: number; cy?: number; payload?: WeeklyWeightPoint; index?: number }) => {
            const { cx, cy, payload, index } = props;
            if (cx === undefined || cy === undefined || payload === undefined) {
              return <g key={`empty-${String(index)}`} />;
            }
            // Incomplete week: an EMPTY point outlined in --warning. A mean
            // from a single weigh-in is not a mean, and a filled dot would
            // pretend it is as trustworthy as its neighbors (DESIGN §10).
            return payload.incomplete ? (
              <circle
                key={`${String(payload.year)}-${String(payload.week)}`}
                cx={cx}
                cy={cy}
                r={5}
                fill="var(--surface)"
                stroke="var(--warning)"
                strokeWidth={2}
              />
            ) : (
              <circle
                key={`${String(payload.year)}-${String(payload.week)}`}
                cx={cx}
                cy={cy}
                r={4}
                fill={SERIES}
              />
            );
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
