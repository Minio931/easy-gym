import { round2 } from "@/lib/metrics";

/**
 * Czyste funkcje wokół pól serii: parsowanie tego, co user wklepał, granice
 * z `CHECK`-ów bazy i walidacja. Wyłącznie tutaj — komponent wiersza serii ma
 * układać piksele, nie pilnować, czy 500.001 kg przejdzie przez bazę.
 *
 * Granice są **te same** co w schemacie Postgresa (PROMPT.md §2): ciężar
 * 0–500, powtórzenia 1–100, RPE 1–10 albo `null`. Przekroczenie ich po
 * stronie serwera to `400`, więc front zaciska je zawczasu, a stepper z
 * definicji nie potrafi wyjść poza zakres.
 */

export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 500;
export const REPS_MIN = 1;
export const REPS_MAX = 100;
export const RPE_MIN = 1;
export const RPE_MAX = 10;

/** Krok steppera ciężaru — najmniejsza para talerzy (2 × 1.25 kg). */
export const WEIGHT_STEP = 2.5;
export const REPS_STEP = 1;

/** Ziarno wpisywanego ciężaru (PROMPT.md §8). 1.25 kg krążek na sztangę = 2.5 kg. */
export const WEIGHT_GRAIN = 0.25;

export const WEIGHT_ERROR = "Ciężar od 0 do 500 kg";
export const REPS_ERROR = "Powtórzenia od 1 do 100";
export const RPE_ERROR = "RPE od 1 do 10";
export const EMPTY_ERROR = "Podaj ciężar i powtórzenia";

/**
 * Parsowanie wartości z pola tekstowego. Przecinek jest akceptowany na równi
 * z kropką — polska klawiatura numeryczna daje przecinek, a `Number("102,5")`
 * to `NaN`. Pusty string to `null` (pusty input ≠ zero), nie 0.
 */
export function parseDecimalInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "") {
    return null;
  }
  if (!/^\d*\.?\d*$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Ciężar do ziarna 0.25 kg — przez round2, bo `Math.round(x*4)/4` zostawia pył. */
export function roundToGrain(weightKg: number): number {
  return round2(Math.round(weightKg / WEIGHT_GRAIN) * WEIGHT_GRAIN);
}

export function clampWeight(weightKg: number): number {
  return clamp(roundToGrain(weightKg), WEIGHT_MIN, WEIGHT_MAX);
}

export function clampReps(reps: number): number {
  return clamp(Math.round(reps), REPS_MIN, REPS_MAX);
}

export function clampRpe(rpe: number): number {
  return clamp(round2(Math.round(rpe * 2) / 2), RPE_MIN, RPE_MAX);
}

/**
 * Wynik steppera ciężaru. Puste pole + `+2.5` startuje od wartości
 * referencyjnej (ostatnia seria), a nie od zera — inaczej pierwsze kliknięcie
 * plusa w nowym ćwiczeniu kasuje kontekst.
 */
export function stepWeight(raw: string, delta: number, fallback: number | null): string {
  const current = parseDecimalInput(raw) ?? fallback ?? 0;
  return formatWeightValue(clampWeight(current + delta));
}

export function stepReps(raw: string, delta: number, fallback: number | null): string {
  const current = parseDecimalInput(raw) ?? fallback ?? 0;
  return String(clampReps(current + delta));
}

/** „102.5", „100" — bez zer na końcu, bo `100.00 kg` czyta się jak formularz. */
export function formatWeightValue(weightKg: number): string {
  return String(round2(weightKg));
}

export interface SetValues {
  weightKg: number;
  reps: number;
  rpe: number | null;
}

export interface SetValidation {
  /** Wypełnione tylko gdy nie ma błędów — wtedy wolno zapisać serię. */
  values: SetValues | null;
  weightError: string | null;
  repsError: string | null;
  rpeError: string | null;
  /** Pola są puste (nie: błędne). Komunikat pokazujemy dopiero przy próbie ✓. */
  incomplete: boolean;
  /** Komunikat pod wierszem; `null` gdy wiersz jest w porządku. */
  message: string | null;
}

/**
 * Walidacja na żywo, nieblokująca: pole poza zakresem dostaje komunikat od
 * razu, ale wpisywanie nie jest przerywane. Zablokowane jest wyłącznie ✓.
 */
export function validateSetInput(
  weightRaw: string,
  repsRaw: string,
  rpe: number | null,
): SetValidation {
  const weight = parseDecimalInput(weightRaw);
  const reps = parseDecimalInput(repsRaw);

  const weightError =
    weight !== null && (weight < WEIGHT_MIN || weight > WEIGHT_MAX) ? WEIGHT_ERROR : null;
  const repsError =
    reps !== null && (reps < REPS_MIN || reps > REPS_MAX || !Number.isInteger(reps))
      ? REPS_ERROR
      : null;
  const rpeError = rpe !== null && (rpe < RPE_MIN || rpe > RPE_MAX) ? RPE_ERROR : null;

  if (weightError !== null || repsError !== null || rpeError !== null) {
    return {
      values: null,
      weightError,
      repsError,
      rpeError,
      incomplete: false,
      message: weightError ?? repsError ?? rpeError,
    };
  }
  if (weight === null || reps === null) {
    return {
      values: null,
      weightError: null,
      repsError: null,
      rpeError: null,
      incomplete: true,
      message: EMPTY_ERROR,
    };
  }
  return {
    values: { weightKg: roundToGrain(weight), reps, rpe },
    weightError: null,
    repsError: null,
    rpeError: null,
    incomplete: false,
    message: null,
  };
}
