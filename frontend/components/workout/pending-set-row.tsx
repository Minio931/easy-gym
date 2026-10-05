"use client";

import type { SetDraft } from "@/lib/workout/draft";

/**
 * A set draft not currently being edited: the values are filled in but
 * the set is NOT confirmed. A tap returns to it as the active row.
 *
 * Deliberately WITHOUT `CheckIcon` — the same icon on the confirmed row
 * (`SetRow`) differed only by background tint, and with identical numbers
 * (a draft starts from a copy of the previous set) it looked at first
 * glance like a second "confirmed" row. A text label removes that
 * ambiguity.
 */
export function PendingSetRow({
  draft,
  index,
  onActivate,
}: {
  draft: SetDraft;
  index: number;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className="flex h-control w-full items-center gap-3 rounded-control px-1 text-left"
    >
      <span className="w-6 shrink-0 text-center">
        {draft.isWarmup ? (
          <span className="inline-block rounded-full bg-surface-3 px-[7px] py-0.5 text-[12px] leading-4 font-semibold text-ink-2">
            R
          </span>
        ) : (
          <span className="meta">{index + 1}</span>
        )}
      </span>
      <span className="num num-md flex-1 truncate text-ink-2">
        {draft.weight === "" ? "—" : draft.weight} <span className="meta">kg</span> ×{" "}
        {draft.reps === "" ? "—" : draft.reps} <span className="meta">powt.</span>
      </span>
      <span aria-hidden="true" className="meta shrink-0 whitespace-nowrap">
        szkic
      </span>
      <span className="sr-only">Niezatwierdzona seria {index + 1}. Wróć do edycji.</span>
    </button>
  );
}
