"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AXIS_PROPS,
  MARGIN,
  TooltipBox,
  Y_AXIS_WIDTH,
  type TooltipPayload,
} from "@/components/charts/chrome";
import { seriesColor, type MuscleGroupBucket } from "@/lib/charts";
import {
  BAR_RADIUS,
  SEGMENT_GAP,
  roundedBarPath,
  segmentEnds,
  type VolumeRow,
} from "@/lib/dashboard/volume";
import { formatVolume } from "@/lib/format";

/**
 * Weekly volume per muscle group — stacked bar per DESIGN §10:
 * 2 px gaps in the surface color between segments, bar ends rounded 4 px.
 * Both require a custom shape: Recharts' `radius` rounds each segment
 * separately (the stack falls apart into a chain of pills), and it cannot
 * do gaps at all.
 *
 * A deload week gets an underline in `--warning` below the bar — shape,
 * not color alone (DESIGN §9), because "less volume" and "a light week
 * from the plan" are two different messages and must not be confused.
 */

const DELOAD_UNDERLINE_OFFSET = 3;

function formatVolumeTick(value: number): string {
  return value.toLocaleString("pl-PL");
}

interface SegmentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: VolumeRow;
}

export function WeeklyVolumeChart({
  rows,
  buckets,
}: {
  rows: readonly VolumeRow[];
  buckets: readonly MuscleGroupBucket[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...rows]} margin={MARGIN}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis {...AXIS_PROPS} dataKey="label" interval="preserveStartEnd" minTickGap={2} />
        <YAxis {...AXIS_PROPS} width={Y_AXIS_WIDTH} tickFormatter={formatVolumeTick} />
        <Tooltip
          cursor={{ fill: "var(--chart-grid)" }}
          content={({ active, payload }: TooltipPayload<VolumeRow>) => {
            const row = active === true ? payload?.[0]?.payload : undefined;
            if (row === undefined) {
              return null;
            }
            return (
              <TooltipBox
                title={`Tydzień ${String(row.week)} · ${formatRange(row)}${row.isDeload ? " · deload" : ""}`}
                lines={[
                  `${formatVolume(row.totalKg)} kg`,
                  ...buckets
                    .filter((bucket) => (row.kg[bucket.key] ?? 0) > 0)
                    .map(
                      (bucket) =>
                        `${bucket.label}: ${formatVolume(row.kg[bucket.key] ?? 0)} kg`,
                    ),
                ]}
              />
            );
          }}
        />
        {buckets.map((bucket) => (
          <Bar
            key={bucket.key}
            stackId="volume"
            name={bucket.label}
            dataKey={(row: VolumeRow) => row.kg[bucket.key] ?? 0}
            isAnimationActive={false}
            shape={(props: SegmentProps) => (
              <Segment {...props} bucket={bucket} buckets={buckets} />
            )}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function Segment({
  x,
  y,
  width,
  height,
  payload,
  bucket,
  buckets,
}: SegmentProps & { bucket: MuscleGroupBucket; buckets: readonly MuscleGroupBucket[] }) {
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    payload === undefined ||
    height < 1
  ) {
    return <g />;
  }

  const { first, last } = segmentEnds(payload, bucket.key, buckets);
  // The gap sits ABOVE a segment, so the top one does not get it —
  // otherwise the whole bar would be 2 px shorter than the axis says. For
  // a segment thinner than the gap we keep 1 px of data instead of the
  // gap: the stroke is real, the empty space lies.
  const gap = last ? 0 : Math.min(SEGMENT_GAP, Math.max(0, height - 1));

  return (
    <g>
      <path
        d={roundedBarPath(
          x,
          y + gap,
          width,
          height - gap,
          last ? BAR_RADIUS : 0,
          first ? BAR_RADIUS : 0,
        )}
        fill={seriesColor(bucket.slot)}
      />
      {first && payload.isDeload && (
        <line
          x1={x}
          y1={y + height + DELOAD_UNDERLINE_OFFSET}
          x2={x + width}
          y2={y + height + DELOAD_UNDERLINE_OFFSET}
          stroke="var(--warning)"
          strokeWidth={2}
        />
      )}
    </g>
  );
}

function formatRange(row: VolumeRow): string {
  const from = row.from.slice(8, 10) + "." + row.from.slice(5, 7);
  const to = row.to.slice(8, 10) + "." + row.to.slice(5, 7);
  return `${from}–${to}`;
}

/**
 * Legend. Mandatory with a stack (DESIGN §10: ≥ 2 series), and direct
 * labels on 12 px tall segments are not placeable.
 */
export function VolumeLegend({ buckets }: { buckets: readonly MuscleGroupBucket[] }) {
  if (buckets.length === 0) {
    return null;
  }
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {buckets.map((bucket) => (
        <li key={bucket.key} className="meta flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 shrink-0 rounded-[3px]"
            style={{ background: seriesColor(bucket.slot) }}
          />
          {bucket.label}
        </li>
      ))}
    </ul>
  );
}
