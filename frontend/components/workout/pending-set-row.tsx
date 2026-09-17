"use client";

import { CheckIcon } from "@/components/ui/icons";
import type { SetDraft } from "@/lib/workout/draft";

/**
 * Szkic serii, który nie jest w tej chwili edytowany: wartości już są, ale ✓
 * jest pusty — widać na pierwszy rzut oka, że ta seria NIE jest odhaczona.
 * Tap wraca do niej jako do wiersza aktywnego.
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
      <span
        aria-hidden="true"
        className="grid size-control shrink-0 place-items-center rounded-control border border-hairline text-ink-3"
      >
        <CheckIcon strokeWidth={2.2} />
      </span>
      <span className="sr-only">Niezatwierdzona seria {index + 1}. Wróć do edycji.</span>
    </button>
  );
}
