"use client";

import { useSyncExternalStore } from "react";

/**
 * Network state via useSyncExternalStore, not useState+useEffect: `navigator`
 * does not exist in server render, and reading it in an effect breaks the
 * `react-hooks/set-state-in-effect` rule (frontend/CLAUDE.md).
 *
 * The server snapshot is `true` — offline is a state the UI should show only
 * once it really knows about it, not flash on every hydration.
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
