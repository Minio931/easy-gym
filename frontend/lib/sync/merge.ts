import type { SyncRecord } from "@/types/sync";

/**
 * Conflict resolution rules — pure functions, no Dexie, no network, because
 * this is the one part of sync where a mistake can go silent.
 *
 * The rule is the same on both sides (backend/API.md, "Resolution rules"):
 * **last-write-wins by `updatedAt`, strictly `>`, ties go to the server.**
 * If the client used `>=` where the server uses `>`, with equal timestamps
 * both sides would consider themselves the winner and the record would differ
 * between devices with no signal that anything was wrong.
 */

/**
 * Should the server version overwrite the local one?
 *
 * `local === undefined` is a new record — take it. For a clean local row
 * (`dirty = 0`) we also always take it: if we have no unsent changes, the
 * server knows better by definition, and its record may be newer even when
 * the timestamps are equal (the same write we sent ourselves).
 *
 * There is a conflict only when the local row is dirty: it wins only if it
 * is **strictly newer**. On a tie it yields to the server — otherwise it
 * would stay dirty forever and come back in every subsequent batch.
 */
export function shouldAcceptIncoming(
  local: { updatedAt: string; dirty: 0 | 1 } | undefined,
  incoming: SyncRecord,
): boolean {
  if (local === undefined || local.dirty === 0) {
    return true;
  }
  return !isStrictlyNewer(local.updatedAt, incoming.updatedAt);
}

/** `a > b` on ISO-8601 timestamps. */
export function isStrictlyNewer(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

/**
 * Safety margin for `since` (backend/API.md, rule 8).
 *
 * `serverTime` marks the START of the transaction, but another device may
 * have its own transaction in flight that commits a millisecond later with
 * an earlier `updatedAt`. Without rolling `since` back, such a write would
 * not land in any subsequent pull and would disappear from this device
 * forever.
 *
 * The cost is a few records resent on every sync — same `id` and same
 * `updatedAt`, so `shouldAcceptIncoming` lets them through with no effect.
 */
export const SINCE_MARGIN_MS = 5 * 60 * 1000;

export function nextSince(serverTime: string, marginMs: number = SINCE_MARGIN_MS): string {
  const parsed = Date.parse(serverTime);
  if (Number.isNaN(parsed)) {
    // A broken timestamp from the server must not silently block sync:
    // `null` means a full pull next time — more expensive, but correct.
    return new Date(0).toISOString();
  }
  return new Date(parsed - marginMs).toISOString();
}
