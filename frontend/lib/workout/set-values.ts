import { round2 } from "@/lib/metrics";

/**
 * Pure functions around the set fields: parsing what the user typed, bounds
 * from the database `CHECK`s, and validation. Only here — the set-row
 * component should arrange pixels, not police whether 500.001 kg passes.
 *
 * Bounds are **the same** as the Postgres schema (PROMPT.md §2): weight
 * 0–500, reps 1–100, RPE 1–10 or `null`. Breaching them on the server is a
 * `400`, so the frontend clamps up front, and the stepper by construction
 * cannot leave the range.
 */

export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 500;
export const REPS_MIN = 1;
export const REPS_MAX = 100;
export const RPE_MIN = 1;
export const RPE_MAX = 10;

/** Weight-stepper step — smallest pair of plates (2 × 1.25 kg). */
export const WEIGHT_STEP = 2.5;
export const REPS_STEP = 1;

/** Grain of the typed weight (PROMPT.md §8). 1.25 kg plate on a bar = 2.5 kg. */
export const WEIGHT_GRAIN = 0.25;

export const WEIGHT_ERROR = "Ciężar od 0 do 500 kg";
export const REPS_ERROR = "Powtórzenia od 1 do 100";
export const RPE_ERROR = "RPE od 1 do 10";
export const EMPTY_ERROR = "Podaj ciężar i powtórzenia";

/**
 * Parsing a value from a text field. A comma is accepted on equal terms
 * with a dot — the Polish numeric keyboard produces a comma, and
 * `Number("102,5")` is `NaN`. An empty string becomes `null` (empty input
 * ≠ zero), not 0.
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

/** Weight to a 0.25 kg grain — via round2, because `Math.round(x*4)/4` leaves dust. */
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
 * Weight-stepper result. An empty field + `+2.5` starts from the reference
 * value (last set), not from zero — otherwise the first plus-click on a new
 * exercise clears the context.
 */
export function stepWeight(raw: string, delta: number, fallback: number | null): string {
  const current = parseDecimalInput(raw) ?? fallback ?? 0;
  return formatWeightValue(clampWeight(current + delta));
}

export function stepReps(raw: string, delta: number, fallback: number | null): string {
  const current = parseDecimalInput(raw) ?? fallback ?? 0;
  return String(clampReps(current + delta));
}

/** "102.5", "100" — no trailing zeros, because `100.00 kg` reads like a form. */
export function formatWeightValue(weightKg: number): string {
  return String(round2(weightKg));
}

export interface SetValues {
  weightKg: number;
  reps: number;
  rpe: number | null;
}

export interface SetValidation {
  /** Populated only when there are no errors — then the set may be saved. */
  values: SetValues | null;
  weightError: string | null;
  repsError: string | null;
  rpeError: string | null;
  /** The fields are empty (not: invalid). We show the message only on a ✓ attempt. */
  incomplete: boolean;
  /** Message under the row; `null` when the row is fine. */
  message: string | null;
}

/**
 * Non-blocking live validation: a field out of range gets a message
 * immediately, but typing is not interrupted. Only ✓ is blocked.
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
