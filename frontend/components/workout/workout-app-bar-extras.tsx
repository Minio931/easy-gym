"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreIcon } from "@/components/ui/icons";
import { SessionMenuSheet } from "@/components/workout/session-menu-sheet";
import { formatDuration } from "@/lib/format";
import { useElapsedSeconds } from "@/lib/use-now";
import {
  discardActiveWorkout,
  openFinishSheet,
  setDeload,
  setWorkoutNotes,
  useWorkoutState,
} from "@/lib/workout/store";

/**
 * Czas trwania sesji i menu sesji w górnym pasku. Czas liczy się z
 * `startedAt` (timestamp absolutny), więc wygaszony ekran go nie zatrzymuje.
 */
export function WorkoutAppBarExtras() {
  const { workout } = useWorkoutState();
  const elapsed = useElapsedSeconds(workout?.startedAt ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  if (workout === null) {
    return null;
  }

  return (
    <>
      <span className="num num-md shrink-0 text-ink-2" aria-label="Czas trwania treningu">
        {formatDuration(elapsed)}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => {
          setMenuOpen(true);
        }}
        className="flex size-touch shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
      >
        <MoreIcon />
        <span className="sr-only">Opcje treningu</span>
      </button>

      {menuOpen && (
        <SessionMenuSheet
          workout={workout}
          onClose={() => {
            setMenuOpen(false);
          }}
          onNotesChange={setWorkoutNotes}
          onDeloadChange={setDeload}
          onFinish={openFinishSheet}
          onDiscard={() => {
            void discardActiveWorkout();
            router.replace("/trening");
          }}
        />
      )}
    </>
  );
}
