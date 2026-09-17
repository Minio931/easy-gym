import { parseDecimalInput } from "@/lib/workout/set-values";
import { round2 } from "@/lib/metrics";

/**
 * Walidacja pola wagi ciała. Granice są **te same** co `CHECK` w bazie i co
 * `@DecimalMin/@DecimalMax` w `SaveBodyWeightRequest`: ostro między 0 a 400.
 * Przekroczenie po stronie serwera to `400`, więc front zaciska zawczasu.
 *
 * Parsowanie liczby dzielimy z polem ciężaru serii (`parseDecimalInput`) —
 * przecinek jako separator dziesiętny jest na polskiej klawiaturze pod kciukiem
 * i musi działać tak samo w obu miejscach.
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
  // Granice są OSTRE po obu stronach — 0 i 400 same w sobie są odrzucane przez
  // bazę, więc dopuszczenie ich tutaj dałoby 400 z serwera zamiast komunikatu.
  if (parsed <= BODY_WEIGHT_MIN || parsed >= BODY_WEIGHT_MAX) {
    return { weightKg: null, error: BODY_WEIGHT_ERROR };
  }
  return { weightKg: round2(parsed), error: null };
}

/** Dzisiejszy dzień kalendarzowy jako `YYYY-MM-DD` w czasie lokalnym. */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
