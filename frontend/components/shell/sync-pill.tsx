"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { requestSync } from "@/lib/sync/engine";
import { useSyncState } from "@/lib/sync/use-sync";
import { useIsOnline } from "@/lib/use-online";
import { retryFailedMutations, useWorkoutState } from "@/lib/workout/store";

/**
 * Pigułka stanu synchronizacji (DESIGN §7.4). Zasady, które łatwo zepsuć:
 * - online i wszystko zapisane => NIE POKAZUJEMY NIC. Cisza jest normą.
 * - offline to stan normalny, nie awaria: kolor --serious, nigdy czerwony,
 *   nigdy modal, nigdy blokowanie przycisków.
 * - stan nigdy nie jest niesiony samym kolorem — zawsze znak + tekst.
 *
 * Kolejność ważności: błąd zapisu > offline > kolejka. Błąd wygrywa, bo to
 * jedyny stan, w którym user musi cokolwiek zrobić.
 */
export function SyncPill() {
  const isOnline = useIsOnline();
  const { failed } = useWorkoutState();
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

  // Licznik zaległości pokazujemy dopiero od etapu 5, bo dopiero teraz oznacza
  // realną robotę: wiersze leżące w Dexie z `dirty = 1`. W etapie 4 kolejka
  // żyła w pamięci zakładki i migałaby przy każdej zatwierdzonej serii, a zapis
  // w tle ma być niewidoczny (spec §4: „Zapis w tle — nic").
  //
  // Online i wszystko wysłane => nie pokazujemy NIC. Cisza jest normą.
  if (sync.pending > 0) {
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
