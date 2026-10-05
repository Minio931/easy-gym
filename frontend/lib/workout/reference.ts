import { formatWeight } from "@/lib/format";
import type { ExerciseReference } from "@/lib/workout/store";

/**
 * The "last: 100 × 5" line — a reference, not decoration (PROMPT §3).
 * Matched by set number: the second set looks at the second set of the
 * previous workout. When there were fewer sets then, we show the last of
 * them — that is still a sensible reference, an empty slot is not.
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

/** Empty string while history is in flight — the line height is reserved,
 * so filling it does not shift the layout. */
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

/** `RPE 8 · do upadku · z asystą` — markers come back as TEXT, never as color alone. */
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

/** Whether this particular set broke a record in this session (source: server response). */
export function isRecordSet(
  set: { id: string },
  records: readonly { setId: string | null }[],
): boolean {
  return records.some((record) => record.setId === set.id);
}
