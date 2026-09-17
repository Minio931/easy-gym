import {
  MUSCLE_GROUP_BUCKETS,
  OTHER_MUSCLE_BUCKET,
  bucketForMuscleGroup,
  bucketWeeklyVolume,
  type MuscleGroupBucket,
} from "@/lib/charts";
import {
  formatIsoDate,
  isoWeekOfDate,
  isoWeekSundayEnd,
  parseIsoDate,
} from "@/lib/metrics";
import type { WeeklyVolumeResponse } from "@/types/api";

/**
 * Wiersze wykresu objętości tygodniowej i rozbicie na grupy mięśniowe.
 *
 * Czyste funkcje: backend oddaje objętość już zsumowaną per tydzień i grupę
 * (`GROUP BY`, PROMPT §9), tutaj tylko układamy to w kształt, który rysuje się
 * bez liczenia w JSX — kubełkowanie 11 grup do 8 slotów palety siedzi
 * w `lib/charts.ts` i jest wyłącznie prezentacyjne.
 */

export interface VolumeRow {
  year: number;
  week: number;
  from: string;
  to: string;
  /** Podpis osi: sam numer tygodnia ISO — na 390 px nic więcej się nie mieści. */
  label: string;
  totalKg: number;
  workoutCount: number;
  isDeload: boolean;
  /** Klucz kubełka → kilogramy. Kubełki bez objętości są nieobecne. */
  kg: Record<string, number>;
}

/**
 * Uzupełnia tygodnie, których nie ma w odpowiedzi.
 *
 * Backend oddaje WYŁĄCZNIE tygodnie z treningiem. Bez dopełnienia sześć
 * tygodni przerwy znika z osi, a ostatni słupek sprzed dwóch miesięcy siada
 * obok bieżącego i wygląda jak zeszły tydzień — ten sam rodzaj kłamstwa, co
 * oś kategorialna na wykresie ćwiczenia (etap 6). Tydzień bez treningu ma tu
 * prawdziwą wartość: zero.
 *
 * To nie jest agregowanie w przeglądarce — sumy przychodzą policzone, tutaj
 * dokładamy tylko puste sloty osi.
 */
export function fillMissingWeeks(
  weeks: readonly WeeklyVolumeResponse[],
  fromIso: string,
  toIso: string,
): WeeklyVolumeResponse[] {
  const byMonday = new Map(weeks.map((week) => [week.from, week]));
  const cursor = parseIsoDate(fromIso);
  const end = parseIsoDate(toIso);
  const filled: WeeklyVolumeResponse[] = [];

  while (cursor <= end) {
    const monday = formatIsoDate(cursor);
    const existing = byMonday.get(monday);
    if (existing === undefined) {
      const week = isoWeekOfDate(monday);
      filled.push({
        year: week.year,
        week: week.week,
        from: monday,
        to: isoWeekSundayEnd(week),
        totalKg: 0,
        byMuscleGroup: {},
        workoutCount: 0,
        isDeload: false,
      });
    } else {
      filled.push(existing);
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return filled;
}

export function volumeRows(weeks: readonly WeeklyVolumeResponse[]): VolumeRow[] {
  return weeks.map((week) => {
    const kg: Record<string, number> = {};
    for (const entry of bucketWeeklyVolume(week.byMuscleGroup)) {
      kg[entry.bucket.key] = entry.kg;
    }
    return {
      year: week.year,
      week: week.week,
      from: week.from,
      to: week.to,
      label: String(week.week),
      totalKg: week.totalKg,
      workoutCount: week.workoutCount,
      isDeload: week.isDeload,
      kg,
    };
  });
}

/**
 * Kubełki obecne w całym zakresie, posortowane po slocie palety.
 *
 * Liczone raz dla CAŁEGO zakresu, nie per tydzień: segmenty stosu muszą mieć
 * stałą kolejność między słupkami, inaczej ten sam kolor wędruje w pionie
 * i wykres „miga" przy przewijaniu wzrokiem.
 */
export function activeBuckets(rows: readonly VolumeRow[]): MuscleGroupBucket[] {
  const seen = new Map<string, MuscleGroupBucket>();
  for (const row of rows) {
    for (const [key, kg] of Object.entries(row.kg)) {
      if (kg > 0 && !seen.has(key)) {
        seen.set(key, bucketByKey(key));
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.slot - b.slot);
}

function bucketByKey(key: string): MuscleGroupBucket {
  // Klucze wierszy pochodzą z `bucketWeeklyVolume`, więc zawsze istnieje
  // kubełek o tym kluczu; szukamy go po dowolnej należącej doń grupie.
  const found = BUCKETS_BY_KEY.get(key);
  if (found === undefined) {
    throw new Error(`Nieznany kubełek: ${key}`);
  }
  return found;
}

const BUCKETS_BY_KEY = new Map<string, MuscleGroupBucket>(
  [...MUSCLE_GROUP_BUCKETS, OTHER_MUSCLE_BUCKET].map((bucket) => [bucket.key, bucket]),
);

/**
 * Rozbicie na PEŁNE grupy z bazy (jest ich 11), zsumowane po całym zakresie
 * i posortowane malejąco. To jest miejsce, w którym widać wszystkie grupy —
 * wykres pokazuje 8 kubełków, bo tyle jest slotów palety (DESIGN §3.4).
 */
export interface MuscleGroupTotal {
  group: string;
  bucket: MuscleGroupBucket;
  kg: number;
  /** Udział w objętości zakresu, 0–1. */
  share: number;
}

export function muscleGroupTotals(weeks: readonly WeeklyVolumeResponse[]): MuscleGroupTotal[] {
  const sums = new Map<string, number>();
  for (const week of weeks) {
    for (const [group, kg] of Object.entries(week.byMuscleGroup)) {
      sums.set(group, (sums.get(group) ?? 0) + kg);
    }
  }
  const total = [...sums.values()].reduce((acc, kg) => acc + kg, 0);
  return [...sums.entries()]
    .filter(([, kg]) => kg > 0)
    .map(([group, kg]) => ({
      group,
      bucket: bucketForMuscleGroup(group),
      kg,
      // Zakres bez ani jednej serii nie ma udziałów — zero zamiast NaN,
      // bo `NaN%` w tabeli wygląda jak błąd danych, a jest brakiem danych.
      share: total > 0 ? kg / total : 0,
    }))
    .sort((a, b) => b.kg - a.kg);
}

/* ------------------------------------------------------------------ *
 * Kształt słupka
 * ------------------------------------------------------------------ */

/** Przerwa między segmentami stosu w px (DESIGN §10). */
export const SEGMENT_GAP = 2;
/** Zaokrąglenie końców słupka w px (DESIGN §10). */
export const BAR_RADIUS = 4;

/**
 * Ścieżka segmentu stosu: zaokrąglona tylko od tych końców, które są końcami
 * CAŁEGO słupka. Zaokrąglanie każdego segmentu z osobna rozsypałoby stos na
 * łańcuch pigułek, a prostokąt `rx` w SVG nie umie zaokrąglić dwóch rogów.
 *
 * Promień jest przycinany do połowy wysokości i szerokości — przy cienkim
 * segmencie pełne 4 px wywinęłoby łuki na drugą stronę.
 */
export function roundedBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  topRadius: number,
  bottomRadius: number,
): string {
  const limit = Math.min(width / 2, height / 2);
  const top = Math.max(0, Math.min(topRadius, limit));
  const bottom = Math.max(0, Math.min(bottomRadius, limit));
  const right = x + width;
  const foot = y + height;

  const parts = [`M ${x} ${y + top}`];
  parts.push(top > 0 ? `A ${top} ${top} 0 0 1 ${x + top} ${y}` : `L ${x} ${y}`);
  parts.push(`L ${right - top} ${y}`);
  if (top > 0) {
    parts.push(`A ${top} ${top} 0 0 1 ${right} ${y + top}`);
  }
  parts.push(`L ${right} ${foot - bottom}`);
  if (bottom > 0) {
    parts.push(`A ${bottom} ${bottom} 0 0 1 ${right - bottom} ${foot}`);
  }
  parts.push(`L ${x + bottom} ${foot}`);
  if (bottom > 0) {
    parts.push(`A ${bottom} ${bottom} 0 0 1 ${x} ${foot - bottom}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * Czy dany kubełek jest w tym tygodniu najniższym/najwyższym widocznym
 * segmentem. Recharts układa stos od pierwszej serii w górę, więc „pierwszy
 * niezerowy w kolejności slotów" leży na dole słupka.
 */
export function segmentEnds(
  row: VolumeRow,
  bucketKey: string,
  order: readonly MuscleGroupBucket[],
): { first: boolean; last: boolean } {
  const visible = order.filter((bucket) => (row.kg[bucket.key] ?? 0) > 0).map((b) => b.key);
  return {
    first: visible[0] === bucketKey,
    last: visible[visible.length - 1] === bucketKey,
  };
}
