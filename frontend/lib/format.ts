import { round2 } from "@/lib/metrics";

/**
 * Number formatting and Polish inflection. Pure functions, because inside
 * components such things spread across fifteen places and you end up with
 * "3 serii".
 */

/** Non-breaking space — a thousands separator must not stand alone at line's end. */
const NBSP = " ";

/** `42:15`, and from an hour up `1:04:12`. Input in seconds, negative → `0:00`. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, "0")}`
    : `${mm}:${String(seconds).padStart(2, "0")}`;
}

/** `1 950` — groups of three digits, NBSP. Fractional values rounded to whole. */
export function formatVolume(kg: number): string {
  const rounded = Math.round(kg);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  let out = "";
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) {
      out += NBSP;
    }
    out += digits[index];
  }
  return sign + out;
}

/** `102.5`, `100` — no trailing zeros; the unit is a separate element (DESIGN §4). */
export function formatWeight(kg: number): string {
  return String(round2(kg));
}

/**
 * Polish inflection by count: 1 → `one`, 2–4 (except 12–14) → `few`,
 * the rest → `many`.
 */
export function pluralPl(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  if (abs === 1) {
    return one;
  }
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return few;
  }
  return many;
}

/** `3 serie`, `1 seria`, `5 serii`. */
export function setsLabel(count: number): string {
  return `${count} ${pluralPl(count, "seria", "serie", "serii")}`;
}

/** `3 ćwiczenia`, `1 ćwiczenie`, `5 ćwiczeń`. */
export function exercisesLabel(count: number): string {
  return `${count} ${pluralPl(count, "ćwiczenie", "ćwiczenia", "ćwiczeń")}`;
}

/** Date in the summary: `wtorek, 15.09.2026`. */
export function formatLongDate(instant: string | Date): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Workout start time from the previous day: `21:40`. */
export function formatTimeOfDay(instant: string | Date): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(date);
}
