"use client";

import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { useElapsedSeconds } from "@/lib/use-now";
import { useRestTimerVisible } from "@/lib/workout/rest-timer";
import { useActiveWorkoutStartedAt } from "@/lib/workout/store";

/**
 * Trwały pasek „Trening trwa · 42:15" nad dolną nawigacją, widoczny z każdego
 * ekranu poza samym treningiem (DESIGN §11). Powrót do sesji jednym tapem,
 * bez cofania się przez historię nawigacji.
 */
export function ActiveWorkoutBar() {
  const startedAt = useActiveWorkoutStartedAt();
  const elapsed = useElapsedSeconds(startedAt);
  const timerVisible = useRestTimerVisible();

  if (startedAt === null) {
    return null;
  }

  return (
    <Link
      href="/trening"
      className="fixed inset-x-0 z-30 border-t border-hairline bg-surface-2"
      style={{
        bottom: `calc(var(--spacing-tabbar) + env(safe-area-inset-bottom, 0px)${
          timerVisible ? " + 64px" : ""
        })`,
      }}
    >
      <span className="mx-auto flex h-11 w-full max-w-[560px] items-center gap-2 px-4">
        <span className="flex-1 text-[15px] font-semibold text-ink">Trening trwa</span>
        <span className="num num-md text-accent">{formatDuration(elapsed)}</span>
      </span>
    </Link>
  );
}
