"use client";

import { formatTimeOfDay } from "@/lib/format";

/** Trening starszy niż 12 h prawie na pewno został zapomniany, a nie trwa. */
const STALE_AFTER_SECONDS = 12 * 3600;

/**
 * Pasek kontekstu sesji. Renderuje się TYLKO wtedy, gdy jest co powiedzieć —
 * pusty pasek zjadałby 44 px pionowego miejsca na ekranie, który i tak jest za
 * krótki na trzy karty ćwiczeń.
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
