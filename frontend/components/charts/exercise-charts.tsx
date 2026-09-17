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
 * Wykresy ekranu ćwiczenia. Trzy osobne kafle, każdy z **jedną osią Y** —
 * ciężar, e1RM i objętość mają zupełnie różne skale, a dwie skale na jednym
 * wykresie to wykres, z którego nie da się nic odczytać (DESIGN §10).
 *
 * Wszystkie trzy używają slotu 1 palety. To nie jest niedopatrzenie: każdy
 * wykres ma jedną serię, więc kolor niczego tu nie rozróżnia, a trzy różne
 * kolory sugerowałyby kodowanie, którego nie ma. Tożsamość niesie tytuł kafla.
 *
 * Deloadu nie wyróżniamy kształtem punktu — DESIGN rezerwuje pusty punkt
 * z obwódką dla niepełnego tygodnia na wykresie wagi i powielanie tego tutaj
 * dałoby dwa znaczenia jednego symbolu. Deload widać w tooltipie i w tabeli.
 */

const SERIES = seriesColor(1);

/**
 * Objętość na osi: kilogramy z separatorem tysięcy, ZAWSZE w tej samej
 * jednostce. Skracanie tylko dużych wartości do ton dawało oś, na której
 * „1,6 t" sąsiaduje z „800" — dwie jednostki na jednej skali.
 */
function formatVolumeTick(value: number): string {
  return value.toLocaleString("pl-PL");
}

/* ------------------------------------------------------------------ *
 * 1. Progresja ciężaru -- główny wykres ćwiczenia
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
            // Format wymagany wprost przez DESIGN §10: „102.5 kg × 5 @RPE 8".
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
              return <g key={`pusty-${String(index)}`} />;
            }
            return (
              <circle
                key={payload.workoutId}
                cx={cx}
                cy={cy}
                // Rozmiar punktu niesie liczbę powtórzeń -- 100 kg x 3 i
                // 100 kg x 10 leżą na tej samej wysokości osi, a to inny wysiłek.
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
 * 2. e1RM w czasie
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
 * 3. Objętość na sesję
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
