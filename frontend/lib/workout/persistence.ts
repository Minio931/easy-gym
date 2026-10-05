import type { WorkoutDetailResponse } from "@/types/api";

/**
 * Snapshot of the active workout in `localStorage`. PROMPT §3.5 requirement:
 * closing the browser mid-session must not erase the workout, and
 * `/api/workouts/active` needs a network, which the gym sometimes lacks.
 *
 * We persist ONLY what the user confirmed. An unconfirmed set draft
 * (including the row pre-filled after ✓) deliberately dies when the tab
 * closes — resurrected two days later it would masquerade as a set no one
 * performed.
 *
 * Stage 5 did NOT replace this with Dexie, it added Dexie alongside. Roles:
 * this snapshot is the synchronous screen cache (full workout in the first
 * frame on entry, without waiting for the async read from IndexedDB), and
 * the durable store and sync source is `lib/db/`. Both copies are written by
 * `commit()` from the same `state.workout`, so they cannot diverge, and
 * both are wiped on logout.
 */

const STORAGE_KEY = "easy-gym.active-workout";
const VERSION = 1;

export interface WorkoutSnapshot {
  version: number;
  /** The snapshot belongs to the account — another account on the same device will not see it. */
  userId: string;
  savedAt: string;
  workout: WorkoutDetailResponse;
}

export function readSnapshot(userId: string): WorkoutSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WorkoutSnapshot>;
    if (parsed.version !== VERSION || parsed.userId !== userId) {
      return null;
    }
    if (typeof parsed.workout !== "object" || parsed.workout === null) {
      return null;
    }
    return {
      version: VERSION,
      userId,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      workout: parsed.workout as WorkoutDetailResponse,
    };
  } catch {
    return null;
  }
}

export function writeSnapshot(userId: string, workout: WorkoutDetailResponse | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (workout === null) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const snapshot: WorkoutSnapshot = {
    version: VERSION,
    userId,
    savedAt: new Date().toISOString(),
    workout,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Full or blocked storage (private mode) must not break the workout —
    // the session stays in memory, it only loses reload resilience.
  }
}

export function clearSnapshot(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
