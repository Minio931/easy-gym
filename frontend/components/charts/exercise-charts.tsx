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

/** Wspólny chrom osi — kolory z tokenów motywu, nigdy z koloru serii (DESIGN §10). */
const AXIS_PROPS = {
  stroke: "var(--chart-axis)",
  tick: { fill: "var(--chart-axis)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

// Bez ujemnego marginesu z lewej. Podciągnięcie wykresu pod oś Y odzyskuje
// kilkanaście pikseli szerokości, ale ucina etykiety osi — a ucięta liczba na
// osi to gorzej niż brak liczby: „108 kg" ucięte do „08 kg" czyta się jak dane.
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

/** Szerokość osi Y dobrana pod najdłuższą etykietę, jaka się tu pojawia. */
const Y_AXIS_WIDTH = 56;

/**
 * Objętość na osi: kilogramy z separatorem tysięcy, ZAWSZE w tej samej
 * jednostce. Skracanie tylko dużych wartości do ton dawało oś, na której
 * „1,6 t" sąsiaduje z „800" — dwie jednostki na jednej skali, czyli dokładnie
 * to, przed czym ostrzega DESIGN §10 przy dwóch osiach Y, tylko gorzej, bo
 * niewidoczne na pierwszy rzut oka.
 */
function formatVolumeTick(value: number): string {
  return value.toLocaleString("pl-PL");
}

function formatDayMonth(value: number): string {
  return new Date(value).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
}

function formatFullDate(value: number): string {
  return new Date(value).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function timeAxis(points: readonly { t: number }[]) {
  return {
    dataKey: "t" as const,
    type: "number" as const,
    // Jeden punkt dałby zdegenerowaną domenę [x, x] i Recharts narysowałby oś
    // bez podziałki -- rozsuwamy ją o dobę w każdą stronę.
    domain:
      points.length === 1
        ? [points[0].t - 86_400_000, points[0].t + 86_400_000]
        : (["dataMin", "dataMax"] as const),
    tickFormatter: formatDayMonth,
    minTickGap: 28,
  };
}

/**
 * Oś czasu dla słupków. Słupek jest rysowany wokół swojego punktu, więc
 * pierwszy i ostatni wystają poza domenę i wchodzą na etykiety osi Y.
 * Rozsuwamy domenę o pół odstępu między sesjami z każdej strony.
 */
function barTimeAxis(points: readonly { t: number }[]) {
  const axis = timeAxis(points);
  if (points.length < 2) {
    return axis;
  }
  const min = points[0].t;
  const max = points[points.length - 1].t;
  const pad = (max - min) / (points.length - 1) / 1.6;
  return { ...axis, domain: [min - pad, max + pad] };
}

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-control border border-hairline bg-surface-2 px-3 py-2 shadow-lg">
      <p className="meta">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-[13px] font-semibold tabular-nums text-ink">
          {line}
        </p>
      ))}
    </div>
  );
}

/** Kształt, w jakim Recharts woła `content` tooltipa. `payload` jest u nich
 *  `readonly` -- bez tego modyfikatora TS odrzuca całą funkcję. */
interface TooltipPayload<T> {
  active?: boolean;
  payload?: readonly { payload?: T }[];
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
