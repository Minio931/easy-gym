import type { WorkoutDayResponse } from "@/types/api";

/**
 * Siatka kalendarza treningów: tygodnie ISO w kolumnach, dni tygodnia
 * w wierszach (poniedziałek u góry) — układ jak w siatce aktywności, bo przy
 * 390 px to jedyny sposób pokazania kwartału bez przewijania.
 *
 * Czysta funkcja: bierze dni z serwera i zakres, oddaje gotową siatkę.
 * Komponent nie liczy dat, bo arytmetyka kalendarzowa w JSX to miejsce,
 * w którym błędy są niewidoczne aż do przełomu roku.
 */

export interface CalendarCell {
  /** `YYYY-MM-DD`. Komórki dopełniające tydzień też mają datę — o tym, że są
   *  poza zakresem, mówi `outside`, nie brak daty. */
  date: string;
  workoutCount: number;
  /** Poza zakresem `from`–`to` (np. dni po dzisiejszym). */
  outside: boolean;
}

export interface CalendarGrid {
  /** Kolumny = kolejne tygodnie, każda z 7 komórkami (pon → niedz). */
  weeks: CalendarCell[][];
  /** Etykiety miesięcy do podpisania kolumn: indeks tygodnia → nazwa. */
  monthLabels: { weekIndex: number; label: string }[];
  maxCount: number;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDay(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  // Południe, nie północ — przy zmianie czasu północ potrafi wylądować
  // w dniu poprzednim. Ta sama konwencja co w `lib/bodyweight/points.ts`.
  return new Date(year, month - 1, day, 12);
}

/** Poniedziałek tygodnia, w którym leży `date`. */
function mondayOf(date: Date): Date {
  const result = new Date(date);
  // `getDay()`: 0 = niedziela. Bez tej korekty niedziela trafiłaby na początek
  // NASTĘPNEGO tygodnia, a tydzień w tym projekcie jest ISO (pon–niedz).
  const shift = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - shift);
  return result;
}

export function buildCalendar(
  days: readonly WorkoutDayResponse[],
  fromIso: string,
  toIso: string,
): CalendarGrid {
  const counts = new Map(days.map((day) => [day.date, day.workoutCount]));
  const start = mondayOf(parseDay(fromIso));

  const weeks: CalendarCell[][] = [];
  const monthLabels: { weekIndex: number; label: string }[] = [];
  let maxCount = 0;
  let lastMonth = -1;

  // Kursor chodzi po DNIACH kalendarza (`setDate`), a przynależność do zakresu
  // rozstrzyga porównanie dat jako tekstu — nigdy arytmetyka na milisekundach.
  // Dodawanie sztywnych 24 h gubi godzinę na zmianie czasu (29 marca), przez co
  // kursor przesuwał się z południa na 13:00 i OSTATNI dzień zakresu wypadał
  // „poza nim”: w kalendarzu obejmującym marzec i wrzesień znikał dzisiejszy
  // dzień razem z treningami, które się na nim odbyły.
  const cursor = new Date(start);
  while (toIsoDate(cursor) <= toIso) {
    const cells: CalendarCell[] = [];
    const weekIndex = weeks.length;

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const iso = toIsoDate(cursor);
      const outside = iso < fromIso || iso > toIso;
      const count = outside ? 0 : (counts.get(iso) ?? 0);
      maxCount = Math.max(maxCount, count);
      cells.push({ date: iso, workoutCount: count, outside });

      if (dayOfWeek === 0 && cursor.getMonth() !== lastMonth) {
        lastMonth = cursor.getMonth();
        monthLabels.push({
          weekIndex,
          label: cursor.toLocaleDateString("pl-PL", { month: "short" }),
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(cells);
  }

  return { weeks, monthLabels, maxCount };
}

/**
 * Stopień wypełnienia komórki, 0–1. Skalujemy do `maxCount`, a nie do sztywnego
 * progu: ktoś trenujący raz dziennie i ktoś trenujący dwa razy mają dostać
 * czytelną siatkę, a nie odpowiednio „wszystko blade" i „wszystko pełne".
 */
export function cellIntensity(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) {
    return 0;
  }
  return Math.min(1, 0.35 + (0.65 * count) / maxCount);
}
