"use client";

import type { ReactNode } from "react";

/**
 * Wspólny chrom wykresów: osie, marginesy, formaty dat i pudełko tooltipa.
 * Wydzielone, bo ekran ćwiczenia i ekran wagi muszą wyglądać jak jeden system,
 * a nie jak dwa wykresy zrobione osobno — druga kopia tych stałych rozjechałaby
 * się przy pierwszej korekcie szerokości osi.
 */

/** Chrom osi — kolory z tokenów motywu, nigdy z koloru serii (DESIGN §10). */
export const AXIS_PROPS = {
  stroke: "var(--chart-axis)",
  tick: { fill: "var(--chart-axis)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

// Bez ujemnego marginesu z lewej. Podciągnięcie wykresu pod oś Y odzyskuje
// kilkanaście pikseli szerokości, ale ucina etykiety osi — a ucięta liczba na
// osi to gorzej niż brak liczby: „108 kg" ucięte do „08 kg" czyta się jak dane.
export const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

/** Szerokość osi Y dobrana pod najdłuższą etykietę, jaka się tu pojawia. */
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
 * Rozsuwamy domenę o pół odstępu między punktami z każdej strony.
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

/** Kształt, w jakim Recharts woła `content` tooltipa. `payload` jest u nich
 *  `readonly` -- bez tego modyfikatora TS odrzuca całą funkcję. */
export interface TooltipPayload<T> {
  active?: boolean;
  payload?: readonly { payload?: T }[];
}
