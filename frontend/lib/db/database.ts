import Dexie from "dexie";
import { readSession } from "@/lib/auth/token-store";
import {
  databaseName,
  EasyGymDatabase,
  META_LAST_SYNC_AT,
  META_SINCE,
} from "@/lib/db/schema";

/**
 * Cykl życia lokalnej bazy. Jedna instancja na konto, otwierana leniwie przy
 * pierwszym użyciu i pamiętana — Dexie trzyma otwarte połączenie z IndexedDB,
 * więc tworzenie nowego obiektu przy każdym zapisie byłoby czystą stratą.
 *
 * Render serwerowy nie ma `indexedDB`, a `logowanie` nie ma jeszcze `userId`.
 * W obu przypadkach `getDatabase()` zwraca `null`, a wołający ma po prostu
 * pominąć zapis lokalny — apka bez IndexedDB (tryb prywatny w części
 * przeglądarek) ma dalej działać online, tylko bez odporności na brak sieci.
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
  // Zmiana konta na tym samym urządzeniu: poprzednie połączenie zamykamy,
  // inaczej zostaje otwarte i blokuje `Dexie.delete()` przy wylogowaniu.
  opened?.db.close();
  const db = new EasyGymDatabase(databaseName(userId));
  opened = { userId, db };
  return db;
}

/** Baza zalogowanego konta albo `null`, gdy nie ma sesji / nie ma IndexedDB. */
export function getDatabase(): EasyGymDatabase | null {
  const userId = readSession()?.userId;
  return userId === undefined ? null : getDatabaseFor(userId);
}

/**
 * Wylogowanie kasuje bazę w całości. Nie czyścimy tabel po kolei — pominięcie
 * jednej zostawiłoby cudze dane na urządzeniu, a to dokładnie ten błąd, przed
 * którym chroni podział „jedna baza na konto".
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
    // Otwarta druga zakładka potrafi zablokować usunięcie. Nie ma po czym
    // eskalować: sesja i tak jest już wyczyszczona, a baza zostanie skasowana
    // przy kolejnym wylogowaniu albo starcie.
  }
}

/* ------------------------------------------------------------------ *
 * Księgowość synchronizacji
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
