"use client";

import { formatTimeOfDay } from "@/lib/format";

/** A workout older than 12 h was almost certainly forgotten, not ongoing. */
const STALE_AFTER_SECONDS = 12 * 3600;

/**
 * Session context bar. Renders ONLY when there is something to say — an
 * empty bar would eat 44 px of vertical room on a screen that is already
 * too short for three exercise cards.
 */
export function SessionContextBar({
  isDeload,
  routineName,
  startedAt,
  elapsedSeconds,
}: {
  isDeload: boolean;
  routineName: string | null;
  startedAt: string;
  elapsedSeconds: number;
}) {
  const stale = elapsedSeconds > STALE_AFTER_SECONDS;
  if (!isDeload && routineName === null && !stale) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      {isDeload && (
        <span
          className="rounded-full px-3 py-1 text-[12px] font-semibold"
          style={{ backgroundColor: "var(--surface-2)", color: "var(--warning)" }}
        >
          Deload
        </span>
      )}
      {routineName !== null && <span className="meta">Szablon: {routineName}</span>}
      {stale && (
        <span className="meta">Trening trwa od wczoraj, {formatTimeOfDay(startedAt)}</span>
      )}
    </div>
  );
}
