import type { BodyWeightResponse, WeeklyBodyWeightResponse } from "@/types/api";

/**
 * Punkty wykresu wagi. Dwie serie na jednej osi Y — surowe pomiary i średnie
 * tygodniowe to ta sama wielkość w tych samych kilogramach, więc wspólna skala
 * jest tu poprawna, a nie złamaniem zasady „jedna oś Y" (DESIGN §10).
 */

const DAY_MS = 86_400_000;

/**
 * Dzień kalendarzowy na pozycję osi X.
 *
 * Bierzemy POŁUDNIE czasu lokalnego, nie północ. Północ leży na granicy doby,
 * więc przy przejściu na czas letni potrafi wylądować w dniu poprzednim —
 * punkt przeskakuje wtedy o jedną kratkę bez żadnego powodu w danych.
 * Ta sama konwencja co w `lib/metrics.ts`.
 */
export function dayToTime(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12).getTime();
}

export interface RawWeightPoint {
  t: number;
  measuredOn: string;
  weightKg: number;
  id: string;
}

export interface WeeklyWeightPoint {
  t: number;
  year: number;
  week: number;
  from: string;
  to: string;
  averageKg: number;
  measurementCount: number;
  incomplete: boolean;
  deltaKg: number | null;
}

export function rawPoints(entries: readonly BodyWeightResponse[]): RawWeightPoint[] {
  return [...entries]
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map((entry) => ({
      t: dayToTime(entry.measuredOn),
      measuredOn: entry.measuredOn,
      weightKg: entry.weightKg,
      id: entry.id,
    }));
}

/**
 * Średnia tygodniowa siada w ŚRODKU tygodnia, nie na jego początku ani końcu.
 * Średnia z poniedziałku do niedzieli nie opisuje poniedziałku — postawiona
 * na granicy sugerowałaby, że opisuje, i rozjeżdżałaby się z chmurą surowych
 * pomiarów, przez którą ma przechodzić.
 */
export function weeklyPoints(
  weeks: readonly WeeklyBodyWeightResponse[],
): WeeklyWeightPoint[] {
  return [...weeks]
    .sort((a, b) => (a.year - b.year) || (a.week - b.week))
    .map((week) => ({
      // Tydzień trwa od poniedziałku 00:00 do poniedziałku 00:00, więc jego
      // środek to czwartek 12:00 — czyli dokładnie trzy doby od POŁUDNIA
      // poniedziałku, które oddaje `dayToTime`. Dodanie jeszcze pół doby
      // (odruch „3,5 dnia") przesuwa punkt na piątek i tydzień robi się krzywy.
      t: dayToTime(week.from) + 3 * DAY_MS,
      year: week.year,
      week: week.week,
      from: week.from,
      to: week.to,
      averageKg: week.averageKg,
      measurementCount: week.measurementCount,
      incomplete: week.incomplete,
      deltaKg: week.deltaKg,
    }));
}

/**
 * Wspólna domena osi Y dla obu serii, z niewielkim marginesem.
 *
 * Bez tego Recharts dobiera domenę per seria i linia średnich potrafi wypaść
 * poza chmurę pomiarów, mimo że z definicji leży w jej środku. Margines jest
 * proporcjonalny do rozpiętości, ale nie mniejszy niż pół kilograma — przy
 * wadze stabilnej co do 200 g wykres bez marginesu jest płaską kreską przy
 * krawędzi.
 */
export function weightDomain(
  raw: readonly RawWeightPoint[],
  weekly: readonly WeeklyWeightPoint[],
): [number, number] | null {
  const values = [...raw.map((p) => p.weightKg), ...weekly.map((p) => p.averageKg)];
  if (values.length === 0) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.1, 0.5);
  return [round1(min - pad), round1(max + pad)];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
