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
 * Wykres wagi ciała, dokładnie wg DESIGN §10:
 * surowe pomiary jako jasne punkty 8 px w `--ink-3`, średnie tygodniowe jako
 * linia 2 px NA WIERZCHU, a tydzień niepełny (< 2 pomiary) jako punkt pusty
 * z obwódką `--warning`.
 *
 * Dwie serie na jednej osi Y są tu poprawne — to ta sama wielkość w tych
 * samych kilogramach. Zasada „jedna oś Y" zabrania dwóch SKAL, nie dwóch serii.
 *
 * Kolejność elementów w JSX to kolejność malowania: `Scatter` przed `Line`,
 * więc linia średnich leży na chmurze pomiarów, a nie pod nią.
 */

const SERIES = seriesColor(1);
const RAW_RADIUS = 4; // 8 px średnicy

export function BodyWeightChart({
  raw,
  weekly,
  domain,
}: {
  raw: readonly RawWeightPoint[];
  weekly: readonly WeeklyWeightPoint[];
  domain: [number, number] | null;
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
          // Obie serie mają własne `data`, więc oś musi wiedzieć, że te same
          // wartości `t` mogą się powtórzyć między seriami.
          allowDuplicatedCategory={false}
        />
        {/* Bez `unit` na podziałce: waga ciała ma część dziesiętną, więc
            „84.6 kg" nie mieści się w szerokości osi i Recharts łamie etykietę
            na dwie linie. Jednostkę niosą nagłówek kafla i tooltip — a węższa
            oś to szerszy wykres. */}
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

        {/* Surowe pomiary: jasne, stonowane — są tłem dla trendu, nie treścią. */}
        <Scatter
          data={[...raw]}
          dataKey="weightKg"
          fill="var(--ink-3)"
          shape={(props: { cx?: number; cy?: number; payload?: RawWeightPoint }) => {
            const { cx, cy, payload } = props;
            if (cx === undefined || cy === undefined || payload === undefined) {
              return <g />;
            }
            return <circle cx={cx} cy={cy} r={RAW_RADIUS} fill="var(--ink-3)" />;
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
              return <g key={`pusty-${String(index)}`} />;
            }
            // Niepełny tydzień: punkt PUSTY z obwódką --warning. Średnia z
            // jednego ważenia to nie średnia, a wypełniony punkt udawałby, że
            // jest tak samo wiarygodna jak sąsiednie (DESIGN §10).
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
