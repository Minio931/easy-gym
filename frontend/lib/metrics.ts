/**
 * lib/metrics.ts — mirror pakietu `metrics` z backendu (Java, ../backend/src/
 * main/java/com/example/easygymbackend/metrics). Te same reguły, te same
 * granice, te same przypadki brzegowe. Rozjazd = front pokaże inny PR niż
 * eksport XLSX z serwera, więc każda zmiana reguły tutaj wymaga tej samej
 * zmiany po stronie Javy (i odwrotnie).
 *
 * Wszystko poniżej to czyste funkcje: zero zależności od React/Dexie/API.
 */

import { addWeeks, getISOWeek, getISOWeekYear, startOfISOWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";

/** Strefa, w której liczymy doby i tygodnie. Backend: IsoWeek.WARSAW. */
export const APP_TIME_ZONE = "Europe/Warsaw";

/** Data kalendarzowa `YYYY-MM-DD` — odpowiednik java.time.LocalDate. */
export type IsoDate = string;

/* ------------------------------------------------------------------ *
 * Precyzja
 *
 * weight_kg to numeric(6,2) w bazie. W TS liczymy na double, więc bez
 * jawnego zaokrąglania 102.5 z API i 102.50000000000001 z lokalnej sumy
 * dałyby fałszywy "nowy rekord" (PROMPT.md §9). Wszystko, co trafia do
 * porównania PR albo na ekran, przechodzi przez round2.
 *
 * Java używa RoundingMode.HALF_UP, czyli połówki w GÓRĘ CO DO MODUŁU
 * (-0.005 -> -0.01). Math.round robi połówki w stronę +∞ (-0.5 -> -0),
 * a mnożenie przez 100 gubi dokładność (1.005 * 100 = 100.49999999999999),
 * stąd przesuwanie przecinka po stronie wykładnika, nie mnożeniem.
 * ------------------------------------------------------------------ */

function shiftDecimalPoint(value: number, places: number): number {
  const [mantissa, exponent] = value.toExponential().split("e");
  return Number(`${mantissa}e${Number(exponent) + places}`);
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const shifted = shiftDecimalPoint(value, 2);
  const rounded = Math.sign(shifted) * Math.round(Math.abs(shifted));
  return shiftDecimalPoint(rounded, -2);
}

/* ------------------------------------------------------------------ *
 * Seria i e1RM
 * ------------------------------------------------------------------ */

export type OneRepMaxFormula = "epley" | "brzycki";

/** Wejście do wszystkich funkcji w tym pliku. Mirror rekordu ExerciseSet z Javy. */
export interface ExerciseSet {
  setId: string;
  /** ISO 8601 z offsetem/Z — moment zatwierdzenia serii. */
  completedAt: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  toFailure: boolean;
  assisted: boolean;
}

const BRZYCKI_MAX_VALID_REPS = 36;

/**
 * e1RM wg Epleya (`weight × (1 + reps/30)`) albo Brzyckiego
 * (`weight × 36 / (37 − reps)`). Dla reps = 1 obie zwracają samą wagę.
 *
 * Brzycki dzieli przez zero przy reps = 37 i zwraca ujemne bzdury powyżej —
 * realne przy bodyweight + to_failure (40 pompek). Zwracamy `null`, nigdy
 * liczby; backend zwraca w tym miejscu Optional.empty().
 */
export function estimate1RM(
  weightKg: number,
  reps: number,
  formula: OneRepMaxFormula,
): number | null {
  if (reps === 1) {
    return round2(weightKg);
  }
  if (formula === "epley") {
    return round2(weightKg * (1 + reps / 30));
  }
  if (reps > BRZYCKI_MAX_VALID_REPS) {
    return null;
  }
  return round2((weightKg * 36) / (37 - reps));
}

/* ------------------------------------------------------------------ *
 * Zakresy powtórzeń
 * ------------------------------------------------------------------ */

export const REP_RANGE_BUCKETS = ["1", "2-3", "4-6", "7-10", "11-15", "15+"] as const;

export type RepRangeBucket = (typeof REP_RANGE_BUCKETS)[number];

export function repRangeBucket(reps: number): RepRangeBucket {
  if (reps === 1) return "1";
  if (reps <= 3) return "2-3";
  if (reps <= 6) return "4-6";
  if (reps <= 10) return "7-10";
  if (reps <= 15) return "11-15";
  return "15+";
}

/* ------------------------------------------------------------------ *
 * Metryki sesji
 * ------------------------------------------------------------------ */

function workingSets(sets: readonly ExerciseSet[]): ExerciseSet[] {
  return sets.filter((set) => !set.isWarmup);
}

function sumVolume(sets: readonly ExerciseSet[]): number {
  return round2(sets.reduce((total, set) => total + set.weightKg * set.reps, 0));
}

/**
 * Objętość sesji DO POKAZANIA użytkownikowi: serie robocze, **wliczając
 * assisted** (praca fizycznie wykonana). To inna liczba niż
 * {@link prEligibleVolumeKg} — i to jest celowe, patrz komentarz tam.
 */
export function displayVolumeKg(sets: readonly ExerciseSet[]): number {
  return sumVolume(workingSets(sets));
}

/**
 * Objętość do PR "największa objętość w sesji": serie robocze **bez
 * assisted**. Dwie osobne nazwane funkcje zamiast jednej z flagą, żeby nie
 * dało się po cichu pomylić jednej z drugą.
 */
export function prEligibleVolumeKg(sets: readonly ExerciseSet[]): number {
  return sumVolume(workingSets(sets).filter((set) => !set.assisted));
}

/** Najcięższa seria: max ciężar wśród roboczych nie-assisted, remis → więcej powtórzeń. */
export function heaviestSet(sets: readonly ExerciseSet[]): ExerciseSet | null {
  const candidates = workingSets(sets).filter((set) => !set.assisted);
  let best: ExerciseSet | null = null;
  for (const set of candidates) {
    if (best === null) {
      best = set;
      continue;
    }
    const weightDiff = round2(set.weightKg) - round2(best.weightKg);
    if (weightDiff > 0 || (weightDiff === 0 && set.reps > best.reps)) {
      best = set;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Rekordy życiowe (PR)
 * ------------------------------------------------------------------ */

export interface PersonalRecordEntry {
  setId: string;
  value: number;
}

export interface SessionVolumeRecord {
  workoutId: string;
  value: number;
}

export interface PersonalRecords {
  maxWeight: PersonalRecordEntry | null;
  maxE1rm: PersonalRecordEntry | null;
  maxSessionVolume: SessionVolumeRecord | null;
  byRepRange: Partial<Record<RepRangeBucket, PersonalRecordEntry>>;
}

/** Jedna sesja treningowa dla jednego ćwiczenia, w kolejności chronologicznej. */
export interface WorkoutSession {
  workoutId: string;
  sets: ExerciseSet[];
}

export function emptyPersonalRecords(): PersonalRecords {
  return { maxWeight: null, maxE1rm: null, maxSessionVolume: null, byRepRange: {} };
}

/**
 * Stan rekordów po przejściu wszystkich sesji. Sesje MUSZĄ być
 * chronologiczne: przy remisie rekord zostaje przy pierwszym wystąpieniu,
 * bo pobicie to ściśle `>`, nigdy `>=`.
 */
export function computePersonalRecords(
  chronologicalSessions: readonly WorkoutSession[],
  formula: OneRepMaxFormula,
): PersonalRecords {
  const records = emptyPersonalRecords();

  for (const session of chronologicalSessions) {
    const sessionVolume = prEligibleVolumeKg(session.sets);
    if (records.maxSessionVolume === null || sessionVolume > records.maxSessionVolume.value) {
      records.maxSessionVolume = { workoutId: session.workoutId, value: sessionVolume };
    }

    for (const set of session.sets) {
      if (set.isWarmup || set.assisted) {
        continue;
      }

      const weight = round2(set.weightKg);
      if (records.maxWeight === null || weight > records.maxWeight.value) {
        records.maxWeight = { setId: set.setId, value: weight };
      }

      const e1rm = estimate1RM(set.weightKg, set.reps, formula);
      if (e1rm !== null && (records.maxE1rm === null || e1rm > records.maxE1rm.value)) {
        records.maxE1rm = { setId: set.setId, value: e1rm };
      }

      const bucket = repRangeBucket(set.reps);
      const currentBucketRecord = records.byRepRange[bucket];
      if (currentBucketRecord === undefined || weight > currentBucketRecord.value) {
        records.byRepRange[bucket] = { setId: set.setId, value: weight };
      }
    }
  }

  return records;
}

/**
 * Rekordy pobite przez OSTATNIĄ sesję z listy — pod baner „PR pobity" w
 * podsumowaniu treningu i kolumnę „czy PR" w eksporcie. To nie to samo co
 * „czy to globalne maksimum": liczy się, czy rekord padł W MOMENCIE
 * wykonania. Ten sam algorytm co {@link computePersonalRecords}, więc reguły
 * nie mogą się rozjechać między ekranem a eksportem.
 */
export function personalRecordsBrokenIn(
  chronologicalSessions: readonly WorkoutSession[],
  formula: OneRepMaxFormula,
): PersonalRecords {
  if (chronologicalSessions.length === 0) {
    return emptyPersonalRecords();
  }

  const latest = chronologicalSessions[chronologicalSessions.length - 1];
  const after = computePersonalRecords(chronologicalSessions, formula);
  const latestSetIds = new Set(latest.sets.map((set) => set.setId));

  const byRepRange: Partial<Record<RepRangeBucket, PersonalRecordEntry>> = {};
  for (const bucket of REP_RANGE_BUCKETS) {
    const entry = after.byRepRange[bucket];
    if (entry !== undefined && latestSetIds.has(entry.setId)) {
      byRepRange[bucket] = entry;
    }
  }

  return {
    maxWeight:
      after.maxWeight !== null && latestSetIds.has(after.maxWeight.setId) ? after.maxWeight : null,
    maxE1rm:
      after.maxE1rm !== null && latestSetIds.has(after.maxE1rm.setId) ? after.maxE1rm : null,
    maxSessionVolume:
      after.maxSessionVolume !== null && after.maxSessionVolume.workoutId === latest.workoutId
        ? after.maxSessionVolume
        : null,
    byRepRange,
  };
}

/* ------------------------------------------------------------------ *
 * Tydzień ISO-8601
 *
 * Poniedziałek → niedziela, strefa Europe/Warsaw. Liczone przez date-fns
 * (getISOWeek / startOfISOWeek), nigdy ręczną arytmetyką na getDay() —
 * tydzień 53 i przełomy roku wysypują każdą wersję „na piechotę".
 * ------------------------------------------------------------------ */

export interface IsoWeek {
  year: number;
  week: number;
}

/**
 * Data kalendarzowa jako Date w strefie *przeglądarki*. Numer tygodnia ISO
 * zależy tylko od dnia kalendarzowego, więc dopóki nie przekraczamy granicy
 * doby (a tu nie przekraczamy — budujemy z gotowych y/m/d), strefa hosta jest
 * bez znaczenia. Instanty przechodzą wcześniej przez warsawCalendarDate.
 */
function calendarDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function parseIsoDate(date: IsoDate): Date {
  const [year, month, day] = date.split("-").map(Number);
  return calendarDate(year, month, day);
}

export function formatIsoDate(date: Date): IsoDate {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Dzień kalendarzowy, w którym dany moment wypadł w Warszawie. */
export function warsawCalendarDate(instant: Date | string | number): IsoDate {
  const zoned = new TZDate(new Date(instant).getTime(), APP_TIME_ZONE);
  return formatIsoDate(calendarDate(zoned.getFullYear(), zoned.getMonth() + 1, zoned.getDate()));
}

export function isoWeekOfDate(date: IsoDate): IsoWeek {
  const parsed = parseIsoDate(date);
  return { year: getISOWeekYear(parsed), week: getISOWeek(parsed) };
}

/**
 * Tydzień ISO dla momentu w czasie (np. `workouts.started_at`) — zawsze po
 * dacie warszawskiej, nie UTC. Sesja kończąca się po północy nie może
 * rozjechać się na dwa tygodnie.
 */
export function isoWeekOfInstant(instant: Date | string | number): IsoWeek {
  return isoWeekOfDate(warsawCalendarDate(instant));
}

/** Poniedziałek danego tygodnia. Kotwica ISO-8601: 4 stycznia zawsze leży w tygodniu 1. */
export function isoWeekMondayStart(week: IsoWeek): IsoDate {
  const anchor = startOfISOWeek(calendarDate(week.year, 1, 4));
  return formatIsoDate(addWeeks(anchor, week.week - 1));
}

export function isoWeekSundayEnd(week: IsoWeek): IsoDate {
  const monday = parseIsoDate(isoWeekMondayStart(week));
  monday.setDate(monday.getDate() + 6);
  return formatIsoDate(monday);
}

export function compareIsoWeeks(a: IsoWeek, b: IsoWeek): number {
  return a.year !== b.year ? a.year - b.year : a.week - b.week;
}

export function isoWeeksEqual(a: IsoWeek, b: IsoWeek): boolean {
  return a.year === b.year && a.week === b.week;
}

export function isoWeekKey(week: IsoWeek): string {
  return `${week.year}-W${String(week.week).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Waga ciała
 * ------------------------------------------------------------------ */

export interface BodyWeightEntry {
  measuredOn: IsoDate;
  weightKg: number;
}

export interface WeeklyBodyWeightAverage {
  week: IsoWeek;
  measurementCount: number;
  averageKg: number;
  /** Mniej niż 2 pomiary — pokazujemy, ale wizualnie wyróżniamy. */
  incomplete: boolean;
}

export function weeklyAverages(
  entries: readonly BodyWeightEntry[],
): WeeklyBodyWeightAverage[] {
  const byWeek = new Map<string, { week: IsoWeek; values: number[] }>();

  for (const entry of entries) {
    const week = isoWeekOfDate(entry.measuredOn);
    const key = isoWeekKey(week);
    const bucket = byWeek.get(key);
    if (bucket === undefined) {
      byWeek.set(key, { week, values: [entry.weightKg] });
    } else {
      bucket.values.push(entry.weightKg);
    }
  }

  return [...byWeek.values()]
    .map(({ week, values }) => ({
      week,
      measurementCount: values.length,
      averageKg: round2(values.reduce((sum, value) => sum + value, 0) / values.length),
      incomplete: values.length < 2,
    }))
    .sort((a, b) => compareIsoWeeks(a.week, b.week));
}

function indexOfWeek(weeks: readonly WeeklyBodyWeightAverage[], target: IsoWeek): number {
  return weeks.findIndex((candidate) => isoWeeksEqual(candidate.week, target));
}

export function weekOverWeekDeltaKg(
  chronologicalWeeks: readonly WeeklyBodyWeightAverage[],
  targetWeek: IsoWeek,
): number | null {
  const index = indexOfWeek(chronologicalWeeks, targetWeek);
  if (index <= 0) {
    return null;
  }
  return round2(chronologicalWeeks[index].averageKg - chronologicalWeeks[index - 1].averageKg);
}

export function weekOverWeekDeltaPercent(
  chronologicalWeeks: readonly WeeklyBodyWeightAverage[],
  targetWeek: IsoWeek,
): number | null {
  const index = indexOfWeek(chronologicalWeeks, targetWeek);
  if (index <= 0) {
    return null;
  }
  const previous = chronologicalWeeks[index - 1].averageKg;
  if (previous === 0) {
    return null;
  }
  return round2(((chronologicalWeeks[index].averageKg - previous) / previous) * 100);
}

/**
 * Krocząca średnia 7-dniowa per dzień pomiaru — osobna seria na wykresie,
 * obok grubej linii średnich tygodniowych. Okno liczy się po pomiarach, które
 * realnie są (dni bez ważenia nie są zerami).
 */
export function sevenDayRollingAverage(
  entries: readonly BodyWeightEntry[],
): Map<IsoDate, number> {
  const byDate = new Map<IsoDate, number>();
  for (const entry of entries) {
    // Duplikat dnia: wygrywa ostatni wpis (baza i tak trzyma jeden żywy na dzień).
    byDate.set(entry.measuredOn, entry.weightKg);
  }

  const result = new Map<IsoDate, number>();
  for (const date of [...byDate.keys()].sort()) {
    const windowStart = parseIsoDate(date);
    windowStart.setDate(windowStart.getDate() - 6);
    const windowStartKey = formatIsoDate(windowStart);

    const values = [...byDate.entries()]
      .filter(([day]) => day >= windowStartKey && day <= date)
      .map(([, value]) => value);

    result.set(date, round2(values.reduce((sum, value) => sum + value, 0) / values.length));
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Trend tydzień do tygodnia
 * ------------------------------------------------------------------ */

export interface WeeklyValue {
  week: IsoWeek;
  value: number;
  isDeload: boolean;
}

export interface TrendResult {
  previousValue: number;
  currentValue: number;
  deltaPercent: number;
}

/**
 * Porównanie tygodnia do poprzedniego. Domyślnie (`includeDeload = false`)
 * tygodnie deload znikają z łańcucha całkowicie — tydzień po deloadzie
 * porównuje się do ostatniego tygodnia nie-deload PRZED nim, nie do samego
 * deloadu (inaczej powrót do normy wygląda jak +162% formy).
 */
export function compareToPreviousWeek(
  chronologicalWeeks: readonly WeeklyValue[],
  targetWeek: IsoWeek,
  includeDeload = false,
): TrendResult | null {
  const relevant = includeDeload
    ? [...chronologicalWeeks]
    : chronologicalWeeks.filter((week) => !week.isDeload);

  const targetIndex = relevant.findIndex((week) => isoWeeksEqual(week.week, targetWeek));
  if (targetIndex <= 0) {
    return null;
  }

  const previousValue = relevant[targetIndex - 1].value;
  const currentValue = relevant[targetIndex].value;
  if (previousValue === 0) {
    return null;
  }

  return {
    previousValue,
    currentValue,
    deltaPercent: round2(((currentValue - previousValue) / previousValue) * 100),
  };
}
