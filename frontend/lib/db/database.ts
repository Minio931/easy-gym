import Dexie from "dexie";
import { readSession } from "@/lib/auth/token-store";
import {
  databaseName,
  EasyGymDatabase,
  META_LAST_SYNC_AT,
  META_SINCE,
} from "@/lib/db/schema";

/**
 * Local database lifecycle. One instance per account, opened lazily on first
 * use and remembered — Dexie keeps the IndexedDB connection open, so
 * creating a new object on every write would be pure waste.
 *
 * The server render has no `indexedDB`, and `logowanie` has no `userId` yet.
 * In both cases `getDatabase()` returns `null` and the caller simply skips
 * the local write — an app without IndexedDB (private mode in some browsers)
 * must keep working online, just without offline resilience.
 */

let opened: { userId: string; db: EasyGymDatabase } | null = null;

function isAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export function getDatabaseFor(userId: string): EasyGymDatabase | null {
  if (!isAvailable() || userId === "") {
    return null;
  }
  if (opened !== null && opened.userId === userId) {
    return opened.db;
  }
  // Account change on the same device: close the previous connection,
  // otherwise it stays open and blocks `Dexie.delete()` at logout.
  opened?.db.close();
  const db = new EasyGymDatabase(databaseName(userId));
  opened = { userId, db };
  return db;
}

/** Database of the signed-in account, or `null` when there is no session / no IndexedDB. */
export function getDatabase(): EasyGymDatabase | null {
  const userId = readSession()?.userId;
  return userId === undefined ? null : getDatabaseFor(userId);
}

/**
 * Logout drops the database entirely. We do not clear tables one by one —
 * missing one would leave someone else's data on the device, which is
 * exactly the bug the "one database per account" split guards against.
 */
export async function dropDatabase(userId: string): Promise<void> {
  if (!isAvailable() || userId === "") {
    return;
  }
  if (opened !== null && opened.userId === userId) {
    opened.db.close();
    opened = null;
  }
  try {
    await Dexie.delete(databaseName(userId));
  } catch {
    // An open second tab can block the deletion. There is nothing to
    // escalate: the session is already cleared, and the database will be
    // dropped on the next logout or startup.
  }
}

/* ------------------------------------------------------------------ *
 * Sync bookkeeping
 * ------------------------------------------------------------------ */

export async function readSince(db: EasyGymDatabase): Promise<string | null> {
  const row = await db.meta.get(META_SINCE);
  return row?.value ?? null;
}

export async function writeSince(db: EasyGymDatabase, since: string): Promise<void> {
  await db.meta.bulkPut([
    { key: META_SINCE, value: since },
    { key: META_LAST_SYNC_AT, value: new Date().toISOString() },
  ]);
}

export async function readLastSyncAt(db: EasyGymDatabase): Promise<string | null> {
  const row = await db.meta.get(META_LAST_SYNC_AT);
  return row?.value ?? null;
}
