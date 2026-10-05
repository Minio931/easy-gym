import { CLEAN, DIRTY, type EasyGymDatabase, type LocalRoutine, type LocalRoutineItem } from "@/lib/db/schema";
import type { RoutineItemResponse, RoutineResponse } from "@/types/api";

/**
 * Workout templates in the local database.
 *
 * A template is two tables (`routines` + `routineItems`), so every write
 * touches both — and in one transaction, because a template without items
 * or items without a template is a state the screen cannot draw.
 *
 * List ordering is the same as on the server (`ORDER BY name`), so the list
 * does not jump when the network data replaces the local one.
 */

/** Live templates with live items, by name — just like `GET /api/routines`. */
export async function readRoutines(db: EasyGymDatabase): Promise<RoutineResponse[]> {
  const [routines, items] = await Promise.all([
    db.routines.toArray(),
    db.routineItems.toArray(),
  ]);

  const itemsByRoutine = new Map<string, RoutineItemResponse[]>();
  for (const item of items) {
    if (item.deletedAt !== null) {
      continue;
    }
    const bucket = itemsByRoutine.get(item.routineId) ?? [];
    bucket.push(toItemResponse(item));
    itemsByRoutine.set(item.routineId, bucket);
  }

  return routines
    .filter((routine) => routine.deletedAt === null)
    .sort((a, b) => a.name.localeCompare(b.name, "pl"))
    .map((routine) => ({
      id: routine.id,
      name: routine.name,
      notes: routine.notes,
      items: (itemsByRoutine.get(routine.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex),
      createdAt: routine.createdAt,
      updatedAt: routine.updatedAt,
      deletedAt: routine.deletedAt,
    }));
}

export async function readRoutine(
  db: EasyGymDatabase,
  id: string,
): Promise<RoutineResponse | null> {
  return (await readRoutines(db)).find((routine) => routine.id === id) ?? null;
}

/**
 * Save a template before sending to the server.
 *
 * An item missing from the new list receives a **tombstone** — exactly what
 * `PUT /api/routines/{id}` does (replaces the whole list). A plain Dexie
 * row deletion would not reach the other device: the sync batch sends
 * records, not information about absence.
 */
export async function saveRoutineLocally(
  db: EasyGymDatabase,
  routine: RoutineResponse,
): Promise<void> {
  await db.transaction("rw", db.routines, db.routineItems, async () => {
    const existing = await db.routines.get(routine.id);
    await db.routines.put({
      id: routine.id,
      name: routine.name,
      notes: routine.notes,
      createdAt: existing?.createdAt ?? routine.createdAt,
      updatedAt: routine.updatedAt,
      deletedAt: null,
      dirty: DIRTY,
    });

    const keep = new Set(routine.items.map((item) => item.id));
    const previous = await db.routineItems.where("routineId").equals(routine.id).toArray();
    for (const item of previous) {
      if (!keep.has(item.id) && item.deletedAt === null) {
        await db.routineItems.put({
          ...item,
          deletedAt: routine.updatedAt,
          updatedAt: routine.updatedAt,
          dirty: DIRTY,
        });
      }
    }

    await db.routineItems.bulkPut(
      routine.items.map((item) => ({ ...toItemRow(item), dirty: DIRTY })),
    );
  });
}

/**
 * Server response to OUR write. Overwrites the local row regardless of
 * `dirty`, because it is newer than what just went into Dexie.
 *
 * Items absent from the response are deleted on the server, so locally
 * they receive a tombstone **with `dirty = 0`** — nothing to send back
 * for something the server just wrote itself.
 */
export async function saveServerRoutine(
  db: EasyGymDatabase,
  routine: RoutineResponse,
): Promise<void> {
  await db.transaction("rw", db.routines, db.routineItems, async () => {
    await db.routines.put({
      id: routine.id,
      name: routine.name,
      notes: routine.notes,
      createdAt: routine.createdAt,
      updatedAt: routine.updatedAt,
      deletedAt: routine.deletedAt,
      dirty: CLEAN,
    });

    const live = new Set(routine.items.map((item) => item.id));
    const previous = await db.routineItems.where("routineId").equals(routine.id).toArray();
    for (const item of previous) {
      if (!live.has(item.id) && item.deletedAt === null) {
        await db.routineItems.put({
          ...item,
          deletedAt: routine.updatedAt,
          updatedAt: routine.updatedAt,
          dirty: CLEAN,
        });
      }
    }

    await db.routineItems.bulkPut(
      routine.items.map((item) => ({ ...toItemRow(item), dirty: CLEAN })),
    );
  });
}

/** Server version: already there, so it does not wait in the outgoing queue. */
export async function cacheServerRoutines(
  db: EasyGymDatabase,
  routines: readonly RoutineResponse[],
): Promise<void> {
  await db.transaction("rw", db.routines, db.routineItems, async () => {
    for (const routine of routines) {
      const existing = await db.routines.get(routine.id);
      // A local change waiting to be sent is newer than what the server knows.
      if (existing?.dirty === DIRTY) {
        continue;
      }
      await db.routines.put({
        id: routine.id,
        name: routine.name,
        notes: routine.notes,
        createdAt: routine.createdAt,
        updatedAt: routine.updatedAt,
        deletedAt: routine.deletedAt,
        dirty: CLEAN,
      });
      for (const item of routine.items) {
        const existingItem = await db.routineItems.get(item.id);
        if (existingItem?.dirty === DIRTY) {
          continue;
        }
        await db.routineItems.put({ ...toItemRow(item), dirty: CLEAN });
      }
    }
  });
}

/** Tombstone on the template and its items — soft delete as on the server. */
export async function markRoutineDeleted(
  db: EasyGymDatabase,
  id: string,
  now: string,
): Promise<void> {
  await db.transaction("rw", db.routines, db.routineItems, async () => {
    const routine = await db.routines.get(id);
    if (routine === undefined) {
      return;
    }
    await db.routines.put({ ...routine, deletedAt: now, updatedAt: now, dirty: DIRTY });
    const items = await db.routineItems.where("routineId").equals(id).toArray();
    await db.routineItems.bulkPut(
      items
        .filter((item) => item.deletedAt === null)
        .map((item) => ({ ...item, deletedAt: now, updatedAt: now, dirty: DIRTY })),
    );
  });
}

function toItemRow(item: RoutineItemResponse): Omit<LocalRoutineItem, "dirty"> {
  return {
    id: item.id,
    routineId: item.routineId,
    exerciseId: item.exerciseId,
    orderIndex: item.orderIndex,
    targetSets: item.targetSets,
    targetReps: item.targetReps,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
  };
}

function toItemResponse(row: LocalRoutineItem): RoutineItemResponse {
  return {
    id: row.id,
    routineId: row.routineId,
    exerciseId: row.exerciseId,
    orderIndex: row.orderIndex,
    targetSets: row.targetSets,
    targetReps: row.targetReps,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export type { LocalRoutine };
