import { searchExercises } from "@/lib/api/exercises";
import { OfflineError } from "@/lib/api/errors";
import { getDatabase } from "@/lib/db/database";
import { cacheExercises, searchLocalExercises } from "@/lib/db/exercise-repository";
import type { ExerciseResponse } from "@/types/api";

/**
 * Exercise search for the screen: server first, falling back to the local
 * catalog when offline.
 *
 * Every successful API response is also cached in Dexie along the way. The
 * first visit to the search opens with an empty `query`, which fetches the
 * whole catalog, so after a single network connection the full set of 60
 * seeded exercises is on the device — and the search works in a basement
 * without signal, instead of showing an empty window.
 *
 * The pitfall this guards against: wiring Dexie into writes alone gave an
 * app in which the workout could be run offline, but no exercise could be
 * ADDED to it — offline useless exactly where it was supposed to work.
 */
export async function findExercises(
  query: string,
  signal?: AbortSignal,
): Promise<ExerciseResponse[]> {
  try {
    const remote = await searchExercises(query, signal);
    const db = getDatabase();
    if (db !== null) {
      void cacheExercises(db, remote).catch(() => undefined);
    }
    return remote;
  } catch (error) {
    // Only no-network falls back to the local reserve. A 4xx/5xx error must
    // reach the screen as an error — pretending that "nothing was found"
    // would hide a broken endpoint.
    if (!(error instanceof OfflineError)) {
      throw error;
    }
    const db = getDatabase();
    return db === null ? [] : searchLocalExercises(db, query);
  }
}
