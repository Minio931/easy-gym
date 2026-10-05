import { parseDecimalInput } from "@/lib/workout/set-values";
import { round2 } from "@/lib/metrics";

/**
 * Body-weight field validation. Bounds are **the same** as the `CHECK` in the
 * database and as `@DecimalMin/@DecimalMax` in `SaveBodyWeightRequest`:
 * strictly between 0 and 400. The server returns `400` on breach, so the
 * frontend clamps up front.
 *
 * Number parsing is shared with the set-weight field (`parseDecimalInput`) —
 * a comma as the decimal separator is right under the thumb on the Polish
 * keyboard and must work the same way in both places.
 */

export const BODY_WEIGHT_MIN = 0;
export const BODY_WEIGHT_MAX = 400;

export const BODY_WEIGHT_ERROR = "Waga musi być większa od 0 i mniejsza niż 400 kg";
export const BODY_WEIGHT_EMPTY_ERROR = "Podaj wagę";

export interface BodyWeightValidation {
  weightKg: number | null;
  error: string | null;
}

export function validateBodyWeightInput(raw: string): BodyWeightValidation {
  if (raw.trim() === "") {
    return { weightKg: null, error: BODY_WEIGHT_EMPTY_ERROR };
  }
  const parsed = parseDecimalInput(raw);
  if (parsed === null) {
    return { weightKg: null, error: BODY_WEIGHT_ERROR };
  }
  // Bounds are STRICT on both sides — 0 and 400 are themselves rejected by
  // the database, so allowing them here would yield a 400 from the server
  // instead of a UI message.
  if (parsed <= BODY_WEIGHT_MIN || parsed >= BODY_WEIGHT_MAX) {
    return { weightKg: null, error: BODY_WEIGHT_ERROR };
  }
  return { weightKg: round2(parsed), error: null };
}

/** Today's calendar day as `YYYY-MM-DD` in local time. */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
