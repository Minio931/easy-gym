"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { requestSync } from "@/lib/sync/engine";
import { useSyncState } from "@/lib/sync/use-sync";
import { useIsOnline } from "@/lib/use-online";
import { retryFailedMutations, useWorkoutState } from "@/lib/workout/store";

/**
 * Sync status pill (DESIGN §7.4). Rules easy to break:
 * - online and everything saved => SHOW NOTHING. Silence is the norm.
 * - offline is a normal state, not a failure: color --serious, never red,
 *   never a modal, never blocking buttons.
 * - state is never carried by color alone — always sign + text.
 *
 * Priority order: write error > offline > queue. Error wins because it is
 * the only state in which the user must do anything.
 */
export function SyncPill() {
  const isOnline = useIsOnline();
  const { failed, pending: inFlight } = useWorkoutState();
  const sync = useSyncState();
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (failed.length > 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setDetailsOpen(true);
          }}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12px] font-semibold"
          style={{ color: "var(--critical)" }}
        >
          <span aria-hidden="true">▲</span>
          Błąd zapisu
        </button>
        {detailsOpen && (
          <Sheet
            title="Błąd zapisu"
            onClose={() => {
              setDetailsOpen(false);
            }}
          >
            <div className="px-4 pt-5 pb-6">
              <h2 className="screen-title">Błąd zapisu</h2>
              <p className="mt-2 text-ink-2">
                Nie udało się zapisać {failed.length}{" "}
                {failed.length === 1 ? "zmiany" : "zmian"}. Trening jest bezpieczny na tym
                urządzeniu.
              </p>
              <ul className="mt-4">
                {failed.map((entry) => (
                  <li key={entry.id} className="border-t border-hairline py-3">
                    <p className="text-ink">{entry.label}</p>
                    <p className="meta">{entry.message}</p>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  retryFailedMutations();
                  setDetailsOpen(false);
                }}
                className="mt-6 h-control w-full rounded-control bg-cta font-semibold text-cta-ink"
              >
                Ponów
              </button>
            </div>
          </Sheet>
        )}
      </>
    );
  }

  if (!isOnline) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-[12px] font-semibold"
        style={{ color: "var(--serious)" }}
        role="status"
      >
        <span aria-hidden="true">●</span>
        Offline
      </span>
    );
  }

  // The pending counter is shown only from stage 5, because only now does
  // it mean real work: rows sitting in Dexie with `dirty = 1`. In stage 4
  // the queue lived in tab memory and would flicker on every confirmed
  // set, and background writes should be invisible (spec §4).
  //
  // Online and everything sent => show NOTHING. Silence is the norm.
  //
  // `inFlight === 0` is key. A write currently flying to the API briefly
  // has its Dexie row marked as unsent — without this guard the pill
  // would blink "⟳ 1 queued" on EVERY confirmed set, whereas background
  // writes must stay invisible (spec §4).
  // The counter is reserved for arrears that nobody is currently pushing:
  // a batch from an offline session or a write that failed.
  if (sync.pending > 0 && inFlight === 0 && sync.status !== "syncing") {
    return (
      <button
        type="button"
        onClick={() => {
          void requestSync();
        }}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12px] font-semibold text-ink-2"
        aria-label={`${sync.pending} ${sync.pending === 1 ? "zmiana czeka" : "zmian czeka"} na wysłanie. Dotknij, aby zsynchronizować teraz.`}
      >
        <span aria-hidden="true">⟳</span>
        {sync.pending} w kolejce
      </button>
    );
  }

  return null;
}
