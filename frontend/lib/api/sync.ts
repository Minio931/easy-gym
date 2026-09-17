import { apiFetch } from "@/lib/api/client";
import type { SyncRequest, SyncResponse } from "@/types/sync";

/**
 * `POST /api/sync` — jedno wywołanie robi push i pull (backend/API.md).
 * Świadomie bez `signal`: synchronizacja ma dokończyć się także wtedy, gdy
 * ekran, który ją wywołał, zdążył się odmontować.
 */
export function postSync(body: SyncRequest): Promise<SyncResponse> {
  return apiFetch<SyncResponse>("/api/sync", { method: "POST", body });
}
