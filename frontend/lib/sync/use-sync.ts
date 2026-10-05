"use client";

import { useSyncExternalStore } from "react";
import { getServerSyncState, getSyncState, subscribeToSync, type SyncState } from "@/lib/sync/engine";

/**
 * Sync state for the UI. The snapshot is cached inside the engine module,
 * because `useSyncExternalStore` compares it by reference — a new object on
 * every call would loop renders (frontend/CLAUDE.md, Next 16 pitfalls).
 */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeToSync, getSyncState, getServerSyncState);
}
