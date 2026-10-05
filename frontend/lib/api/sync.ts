import { apiFetch } from "@/lib/api/client";
import type { SyncRequest, SyncResponse } from "@/types/sync";

/**
 * `POST /api/sync` — one call does both push and pull (backend/API.md).
 * Deliberately without `signal`: sync must finish even when the screen that
 * triggered it has already unmounted.
 */
export function postSync(body: SyncRequest): Promise<SyncResponse> {
  return apiFetch<SyncResponse>("/api/sync", { method: "POST", body });
}
