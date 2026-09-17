"use client";

import { useSyncExternalStore } from "react";
import { getServerSyncState, getSyncState, subscribeToSync, type SyncState } from "@/lib/sync/engine";

/**
 * Stan synchronizacji dla UI. Migawka jest cache'owana w module silnika, bo
 * `useSyncExternalStore` porównuje ją referencyjnie — nowy obiekt przy każdym
 * wywołaniu zapętliłby render (frontend/CLAUDE.md, pułapki Next 16).
 */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeToSync, getSyncState, getServerSyncState);
}
