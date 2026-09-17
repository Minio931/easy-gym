import { CLEAN, DIRTY, type EasyGymDatabase, type LocalBodyWeight } from "@/lib/db/schema";
import type { BodyWeightResponse } from "@/types/api";

/**
 * Wpisy wagi w lokalnej bazie.
 *
 * Kluczem biznesowym jest DZIEŃ, nie `id` — dokładnie tak jak po stronie
 * serwera (częściowy indeks unikalny na `(user_id, measured_on)` z V3).
 * Zapis lokalny musi więc też być upsertem po dacie: gdyby tworzył nowy wiersz
 * przy każdej poprawce, dwa wpisy z tego samego dnia pojechałyby w paczce sync
 * i serwer musiałby jeden z nich odrzucić tombstone'em. To by działało, ale
 * użytkownik zobaczyłby, jak jego poprawka znika po synchronizacji.
 */

/** Żywe wpisy, od najstarszego — taki porządek zakładają funkcje z `lib/metrics.ts`. */
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
 * Upsert po dacie. Zwraca zapisany wpis — z `id` istniejącego wiersza, jeśli
 * ten dzień był już zważony, więc wołający może wysłać na serwer to samo `id`.
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

/** Wersja z serwera: już tam jest, więc nie czeka w kolejce wysyłki. */
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
    // Lokalna poprawka czekająca na wysłanie jest nowsza niż to, co wie serwer.
    if (existing?.dirty === DIRTY) {
      continue;
    }
    rows.push({ ...entry, dirty: CLEAN });
  }
  await db.bodyWeights.bulkPut(rows);
}

/** Tombstone — po nim ten sam dzień można zważyć ponownie (indeks jest częściowy). */
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
