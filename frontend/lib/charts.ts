import { subMonths, subYears } from "date-fns";

/**
 * Wspólna logika wykresów: zakresy czasu i przypisanie serii do slotów palety.
 * Czyste funkcje — komponenty wykresów mają rysować, nie liczyć.
 *
 * Kolory NIE są tu zapisane jako wartości. Siedzą w `app/globals.css`
 * (`--series-1` … `--series-8`, osobne wartości dla motywu jasnego i ciemnego)
 * i tutaj są tylko nazwami zmiennych CSS. Wpisanie hexów do TS-a dałoby drugą
 * paletę, która rozjeżdża się z pierwszą przy pierwszej korekcie koloru —
 * i wykres w jasnym motywie z kolorami z ciemnego.
 */

/* ------------------------------------------------------------------ *
 * Zakres czasu
 * ------------------------------------------------------------------ */

export type ChartRange = "1M" | "3M" | "6M" | "1R" | "ALL";

export const CHART_RANGES: readonly { key: ChartRange; label: string }[] = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1R", label: "1R" },
  { key: "ALL", label: "Całość" },
];

export const DEFAULT_CHART_RANGE: ChartRange = "3M";

/**
 * Początek zakresu jako moment, albo `null` dla „Całość".
 *
 * Liczymy kalendarzowo (`subMonths`), nie „30 dni wstecz”: użytkownik czytający
 * „3M” oczekuje tego samego dnia miesiąca, a nie 90 dni. Dla lutego `subMonths`
 * przycina dzień do końca miesiąca, co jest zachowaniem pożądanym — nie chcemy
 * przeskoku na marzec.
 *
 * Arytmetyka idzie w czasie LOKALNYM, więc przeskok czasu letniego wewnątrz
 * zakresu przesuwa wynikowy moment o godzinę. Świadomie tego nie prostujemy:
 * przy progu mierzonym w miesiącach godzina nie zmienia ani jednego punktu na
 * wykresie, a pinowanie do `Europe/Warsaw` (jak w `lib/metrics.ts`) byłoby tu
 * maszynerią bez skutku. W metrykach jest odwrotnie i słusznie — tam godzina
 * decyduje o przypisaniu sesji do tygodnia ISO.
 */
export function rangeStart(range: ChartRange, now: Date): Date | null {
  switch (range) {
    case "1M":
      return subMonths(now, 1);
    case "3M":
      return subMonths(now, 3);
    case "6M":
      return subMonths(now, 6);
    case "1R":
      return subYears(now, 1);
    case "ALL":
      return null;
  }
}

/**
 * Filtr listy po zakresie. Granica jest **domknięta od dołu** (`>=`): sesja
 * dokładnie sprzed trzech miesięcy należy do „3M". Wykluczanie jej dawałoby
 * wykres, z którego przy każdym odświeżeniu znika skrajny punkt bez powodu
 * widocznego dla patrzącego.
 */
export function filterByRange<T>(
  items: readonly T[],
  range: ChartRange,
  now: Date,
  instantOf: (item: T) => string,
): T[] {
  const start = rangeStart(range, now);
  if (start === null) {
    return [...items];
  }
  const cutoff = start.getTime();
  return items.filter((item) => Date.parse(instantOf(item)) >= cutoff);
}

/* ------------------------------------------------------------------ *
 * Sloty palety
 * ------------------------------------------------------------------ */

export const SERIES_SLOT_COUNT = 8;

/**
 * Kolor serii jako zmienna CSS. Slot liczymy od 1 (`seriesColor(1)`), bo tak
 * są nazwane tokeny i w DESIGN.md.
 *
 * Powyżej ósmej serii **nie zapętlamy palety** — kolejność slotów jest
 * mechanizmem bezpieczeństwa dla daltonizmu (DESIGN §3.4), a dziewiąta seria
 * w kolorze pierwszej to dwie serie nie do odróżnienia. Zamiast tego oddajemy
 * `--ink-3`: neutralny, widocznie „inny", czytelny sygnał, że tych danych nie
 * da się już rozróżnić kolorem i trzeba je pokazać inaczej (tabela, filtr).
 */
export function seriesColor(slot: number): string {
  if (!Number.isInteger(slot) || slot < 1 || slot > SERIES_SLOT_COUNT) {
    return "var(--ink-3)";
  }
  return `var(--series-${slot})`;
}

/* ------------------------------------------------------------------ *
 * Skalowanie punktu liczbą powtórzeń
 * ------------------------------------------------------------------ */

/** Promień punktu w px. Dolna granica pilnuje celu dotykowego i widoczności. */
export const POINT_RADIUS_MIN = 4;
export const POINT_RADIUS_MAX = 9;

/**
 * Główny wykres ćwiczenia ma punkt skalowany liczbą powtórzeń (DESIGN §10 —
 * „wymóg produktowy, nie ozdoba"): 100 kg × 3 i 100 kg × 10 to zupełnie inny
 * wysiłek, a na osi ciężaru leżą w tym samym miejscu.
 *
 * Skalujemy **pole koła**, nie promień. Promień liniowy w liczbie powtórzeń
 * zawyża różnicę kwadratowo — oko czyta powierzchnię, więc punkt „10 powtórzeń"
 * wyglądałby na ponad trzy razy większy wysiłek niż „3 powtórzenia", zamiast
 * na trochę większy.
 */
export function pointRadiusForReps(reps: number, minReps: number, maxReps: number): number {
  if (!Number.isFinite(reps) || reps <= 0) {
    return POINT_RADIUS_MIN;
  }
  if (maxReps <= minReps) {
    // Wszystkie serie na tę samą liczbę powtórzeń: żadna nie jest „większa",
    // więc jednakowy, średni punkt zamiast arbitralnego minimum.
    return (POINT_RADIUS_MIN + POINT_RADIUS_MAX) / 2;
  }
  const clamped = Math.min(Math.max(reps, minReps), maxReps);
  const position = (clamped - minReps) / (maxReps - minReps);
  const areaMin = POINT_RADIUS_MIN ** 2;
  const areaMax = POINT_RADIUS_MAX ** 2;
  return Math.sqrt(areaMin + position * (areaMax - areaMin));
}
