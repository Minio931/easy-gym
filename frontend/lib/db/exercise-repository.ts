import { CLEAN, DIRTY, type EasyGymDatabase, type LocalExercise } from "@/lib/db/schema";
import type { ExerciseResponse } from "@/types/api";

/**
 * Exercise catalog in the local database. Populated from two sides: the
 * `GET /api/exercises` response (when there is a network) and the
 * `POST /api/sync` pull. Thanks to this, after a single successful
 * connection the search also works offline.
 */

export async function cacheExercises(
  db: EasyGymDatabase,
  exercises: readonly ExerciseResponse[],
): Promise<void> {
  const rows: LocalExercise[] = [];
  for (const exercise of exercises) {
    const existing = await db.exercises.get(exercise.id);
    // A local version waiting to be sent is newer than what the server
    // knows — overwriting it with the list response would clear a rename
    // just made offline.
    if (existing?.dirty === DIRTY) {
      continue;
    }
    rows.push({
      id: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
      isArchived: exercise.isArchived,
      createdAt: exercise.createdAt,
      updatedAt: exercise.updatedAt,
      deletedAt: exercise.deletedAt,
      dirty: CLEAN,
    });
  }
  await db.exercises.bulkPut(rows);
}

/**
 * Local-catalog search — **only as a fallback when there is no network**.
 *
 * The server searches via `pg_trgm` and catches typos; here it is a plain
 * "contains", because the browser has no trigrams. Deliberately worse search:
 * offline "wyciskanei" finds nothing, where online it would find wyciskanie.
 * The alternative would be an empty search box at the gym, so worse wins.
 *
 * We compare without diacritics, so "lawka" matches "ławkę" — on a phone
 * mid-set no one aims for the accents.
 */
export async function searchLocalExercises(
  db: EasyGymDatabase,
  query: string,
): Promise<ExerciseResponse[]> {
  const rows = (await db.exercises.toArray()).filter(
    (row) => row.deletedAt === null && !row.isArchived,
  );
  const needle = fold(query.trim());
  const matched =
    needle === "" ? rows : rows.filter((row) => fold(row.name).includes(needle));

  return matched
    .sort((a, b) => a.name.localeCompare(b.name, "pl"))
    .map((row) => ({
      id: row.id,
      // The local DB does not store `userId` (one DB = one account), and
      // this screen only uses the field to mark "global, do not edit".
      // Offline no one edits the catalog, so `null` is safe here.
      userId: null,
      name: row.name,
      muscleGroup: row.muscleGroup,
      equipment: row.equipment,
      isArchived: row.isArchived,
      global: true,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    }));
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
