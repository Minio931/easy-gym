"use client";

import { formatDuration } from "@/lib/format";
import { addRestSeconds, skipRest, useRestTimer } from "@/lib/workout/rest-timer";

/** Last 10 s: the bar and number switch to --warning (DESIGN §7.3). */
const WARNING_THRESHOLD_SECONDS = 10;

/**
 * Rest-timer bar — sticky above the bottom nav, rendered in the app shell,
 * not in the exercise card. This way the rest keeps running when the user
 * peeks at history, and it is visible from every tab.
 *
 * The number comes from `endsAt`, so a dark screen does not stop it.
 */
export function RestTimerBar() {
  const timer = useRestTimer();

  if (!timer.running && !timer.finished) {
    return null;
  }

  const warning = timer.running && timer.remainingSeconds <= WARNING_THRESHOLD_SECONDS;
  const accent = warning ? "var(--warning)" : "var(--accent)";

  return (
    <div
      className="slide-up-in fixed inset-x-0 z-30 border-t border-hairline bg-surface-2"
      style={{ bottom: "calc(var(--spacing-tabbar) + env(safe-area-inset-bottom, 0px))" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5"
        style={{
          width: `${Math.round(timer.progress * 100)}%`,
          backgroundColor: accent,
        }}
      />
      <div className="mx-auto flex h-16 w-full max-w-[560px] items-center gap-2.5 px-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          onClick={() => {
            if (timer.workoutExerciseId !== null) {
              document
                .getElementById(`cwiczenie-${timer.workoutExerciseId}`)
                ?.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          }}
        >
          {timer.finished ? (
            <span className="text-ink">Przerwa skończona</span>
          ) : (
            <>
              <span className="num num-md" style={warning ? { color: "var(--warning)" } : undefined}>
                {formatDuration(timer.remainingSeconds)}
              </span>
              <span className="meta">przerwa</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            addRestSeconds(30);
          }}
          className="h-touch shrink-0 rounded-full border border-hairline px-3.5 text-[13px] font-semibold text-ink-2"
        >
          +30 s
        </button>
        <button
          type="button"
          onClick={skipRest}
          className="h-touch shrink-0 rounded-full border border-hairline px-3.5 text-[13px] font-semibold text-ink-2"
        >
          Pomiń
        </button>
      </div>
      {timer.finished && (
        <span role="status" className="sr-only">
          Przerwa skończona
        </span>
      )}
    </div>
  );
}
