import { formatWeight } from "@/lib/format";
import type { ExerciseReference } from "@/lib/workout/store";

/**
 * Linijka „ostatnio: 100 × 5" — punkt odniesienia, nie ozdoba (PROMPT §3).
 * Dopasowanie po numerze serii: druga seria patrzy na drugą serię poprzedniego
 * treningu. Gdy poprzednio było mniej serii, pokazujemy ostatnią z nich —
 * to nadal jest sensowne odniesienie, a puste miejsce nie jest.
 */
export function referenceSet(
  reference: ExerciseReference | undefined,
  setIndex: number,
): { weightKg: number; reps: number } | null {
  if (reference === undefined || reference.sets.length === 0) {
    return null;
  }
  return reference.sets[Math.min(setIndex, reference.sets.length - 1)];
}

/** Pusty string dopóki historia leci — wysokość linijki jest zarezerwowana,
 * więc jej wypełnienie nie przesuwa layoutu. */
export function referenceText(
  reference: ExerciseReference | undefined,
  setIndex: number,
): string {
  if (reference === undefined || reference.status === "loading") {
    return "";
  }
  const previous = referenceSet(reference, setIndex);
  return previous === null
    ? "pierwszy raz"
    : `ostatnio: ${formatWeight(previous.weightKg)} × ${previous.reps}`;
}

/** `RPE 8 · do upadku · z asystą` — znaczniki wracają jako TEKST, nigdy sam kolor. */
export function markersText(set: {
  rpe: number | null;
  toFailure: boolean;
  assisted: boolean;
}): string {
  const parts: string[] = [];
  if (set.rpe !== null) {
    parts.push(`RPE ${set.rpe}`);
  }
  if (set.toFailure) {
    parts.push("do upadku");
  }
  if (set.assisted) {
    parts.push("z asystą");
  }
  return parts.join(" · ");
}

/** Czy ta konkretna seria pobiła rekord w tej sesji (źródło: odpowiedź serwera). */
export function isRecordSet(
  set: { id: string },
  records: readonly { setId: string | null }[],
): boolean {
  return records.some((record) => record.setId === set.id);
}
