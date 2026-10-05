import { CLEAN, DIRTY, type EasyGymDatabase, type LocalBodyWeight } from "@/lib/db/schema";
import type { BodyWeightResponse } from "@/types/api";

/**
 * Body-weight entries in the local database.
 *
 * The business key is the DAY, not `id` — exactly as on the server (partial
 * unique index on `(user_id, measured_on)` from V3). The local write must
 * therefore also be an upsert by date: if it created a new row on every
 * correction, two entries with the same day would ship in a sync batch and
 * the server would reject one of them with a tombstone. That would work,
 * but the user would see their correction vanish after the sync.
 */

/** Live entries, oldest first — the order expected by `lib/metrics.ts` functions. */
export async function readBodyWeights(db: EasyGymDatabase): Promise<BodyWeightResponse[]> {
  const rows = await db.bodyWeights.toArray();
  return rows
    .filter((row) => row.deletedAt === null)
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map(toResponse);
}

export async function readBodyWeightOn(
  db: EasyGymDatabase,
  measuredOn: string,
): Promise<BodyWeightResponse | null> {
  const row = (await db.bodyWeights.where("measuredOn").equals(measuredOn).toArray()).find(
    (candidate) => candidate.deletedAt === null,
  );
  return row === undefined ? null : toResponse(row);
}

/**
 * Upsert by date. Returns the saved entry — with the `id` of the existing
 * row if that day was already weighed, so the caller can send the same `id`
 * to the server.
 */
export async function saveBodyWeightLocally(
  db: EasyGymDatabase,
  entry: { id: string; measuredOn: string; weightKg: number; note: string | null; updatedAt: string },
): Promise<BodyWeightResponse> {
  const existing = await readBodyWeightOn(db, entry.measuredOn);
  const row: LocalBodyWeight = {
    id: existing?.id ?? entry.id,
    measuredOn: entry.measuredOn,
    weightKg: entry.weightKg,
    note: entry.note,
    updatedAt: entry.updatedAt,
    deletedAt: null,
    dirty: DIRTY,
  };
  await db.bodyWeights.put(row);
  return toResponse(row);
}

/** Server version: already there, so it does not wait in the outgoing queue. */
export async function saveServerBodyWeight(
  db: EasyGymDatabase,
  entry: BodyWeightResponse,
): Promise<void> {
  await db.bodyWeights.put({ ...entry, dirty: CLEAN });
}

export async function cacheServerBodyWeights(
  db: EasyGymDatabase,
  entries: readonly BodyWeightResponse[],
): Promise<void> {
  const rows: LocalBodyWeight[] = [];
  for (const entry of entries) {
    const existing = await db.bodyWeights.get(entry.id);
    // A local correction waiting to be sent is newer than what the server knows.
    if (existing?.dirty === DIRTY) {
      continue;
    }
    rows.push({ ...entry, dirty: CLEAN });
  }
  await db.bodyWeights.bulkPut(rows);
}

/** Tombstone — after it the same day can be weighed again (the index is partial). */
export async function markBodyWeightDeleted(
  db: EasyGymDatabase,
  id: string,
  now: string,
): Promise<void> {
  const row = await db.bodyWeights.get(id);
  if (row !== undefined) {
    await db.bodyWeights.put({ ...row, deletedAt: now, updatedAt: now, dirty: DIRTY });
  }
}

function toResponse(row: LocalBodyWeight): BodyWeightResponse {
  return {
    id: row.id,
    measuredOn: row.measuredOn,
    weightKg: row.weightKg,
    note: row.note,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
