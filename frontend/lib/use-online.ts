"use client";

import { useSyncExternalStore } from "react";

/**
 * Stan sieci przez useSyncExternalStore, nie useState+useEffect: `navigator`
 * nie istnieje w renderze serwerowym, a czytanie go w efekcie łamie regułę
 * `react-hooks/set-state-in-effect` (frontend/CLAUDE.md).
 *
 * Migawka serwerowa to `true` — offline jest stanem, który UI ma pokazać
 * dopiero, gdy naprawdę o nim wie, a nie mignąć przy każdej hydracji.
 */
function subscribe(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
