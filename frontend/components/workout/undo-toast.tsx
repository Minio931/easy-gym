"use client";

import { dismissUndo, undoDeleteSet, useWorkoutState } from "@/lib/workout/store";
import { useRestTimerVisible } from "@/lib/workout/rest-timer";

/**
 * Toast po miękkim usunięciu serii. Żyje 8 s i siedzi NAD timerem, żeby nie
 * zasłonić aktywnego wiersza ani przycisków przerwy — usunięcie serii jest
 * odwracalne, ale okno na „Cofnij" jest krótkie i musi być widoczne.
 */
export function UndoToast() {
  const { undo } = useWorkoutState();
  const timerVisible = useRestTimerVisible();

  if (undo === null) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-40 px-4"
      style={{
        bottom: `calc(var(--spacing-tabbar) + env(safe-area-inset-bottom, 0px) + ${
          timerVisible ? "64px + 12px" : "12px"
        })`,
      }}
    >
      <div className="mx-auto flex w-full max-w-[560px] items-center gap-3 rounded-control border border-hairline bg-surface-3 py-2 pr-2 pl-4">
        <span className="flex-1 text-[15px] text-ink">Seria usunięta</span>
        <button
          type="button"
          onClick={undoDeleteSet}
          className="h-touch rounded-control px-3 text-[15px] font-semibold text-accent"
        >
          Cofnij
        </button>
        <button
          type="button"
          onClick={dismissUndo}
          className="h-touch px-2 text-ink-3"
          aria-label="Zamknij powiadomienie"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
