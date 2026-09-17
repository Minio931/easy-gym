import { CLEAN, DIRTY, type EasyGymDatabase, type LocalRoutine, type LocalRoutineItem } from "@/lib/db/schema";
import type { RoutineItemResponse, RoutineResponse } from "@/types/api";

/**
 * Szablony treningów w lokalnej bazie.
 *
 * Szablon to dwie tabele (`routines` + `routineItems`), więc każdy zapis
 * dotyka obu — i w tej samej transakcji, bo szablon bez pozycji albo pozycje
 * bez szablonu to stan, którego ekran nie umie narysować.
 *
 * Kolejność listy jest taka jak na serwerze (`ORDER BY name`), żeby lista
 * nie przeskakiwała w momencie, w którym dane z sieci podmieniają lokalne.
 */

/** Żywe szablony z żywymi pozycjami, po nazwie — tak jak `GET /api/routines`. */
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
 * Zapis szablonu przed wysłaniem na serwer.
 *
 * Pozycja, której nie ma w nowej liście, dostaje **tombstone** — dokładnie to
 * robi `PUT /api/routines/{id}` (podmienia całą listę). Zwykłe skasowanie
 * wiersza z Dexie nie dojechałoby do drugiego urządzenia: paczka sync wysyła
 * rekordy, a nie informację o nieobecności.
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
 * Odpowiedź serwera na NASZ zapis. Nadpisuje lokalny wiersz bez względu na
 * `dirty`, bo jest nowsza od tego, co przed chwilą poszło do Dexie.
 *
 * Pozycje nieobecne w odpowiedzi są na serwerze skasowane, więc lokalnie
 * dostają tombstone **z `dirty = 0`** — nie ma po co wysyłać z powrotem
 * czegoś, co serwer właśnie sam zapisał.
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

/** Wersja z serwera: już tam jest, więc nie czeka w kolejce wysyłki. */
export async function cacheServerRoutines(
  db: EasyGymDatabase,
  routines: readonly RoutineResponse[],
): Promise<void> {
  await db.transaction("rw", db.routines, db.routineItems, async () => {
    for (const routine of routines) {
      const existing = await db.routines.get(routine.id);
      // Lokalna zmiana czekająca na wysłanie jest nowsza niż to, co wie serwer.
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

/** Tombstone na szablonie i na jego pozycjach — soft delete tak jak na serwerze. */
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
