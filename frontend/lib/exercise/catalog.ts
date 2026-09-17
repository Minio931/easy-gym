import { searchExercises } from "@/lib/api/exercises";
import { OfflineError } from "@/lib/api/errors";
import { getDatabase } from "@/lib/db/database";
import { cacheExercises, searchLocalExercises } from "@/lib/db/exercise-repository";
import type { ExerciseResponse } from "@/types/api";

/**
 * Wyszukiwarka ćwiczeń dla ekranu: serwer, a bez zasięgu lokalny katalog.
 *
 * Każda udana odpowiedź z API ląduje przy okazji w Dexie. Pierwsze wejście w
 * wyszukiwarkę pobiera cały katalog (pusty `query`), więc po jednym połączeniu
 * z siecią komplet 60 ćwiczeń z seeda jest na urządzeniu — i wyszukiwarka
 * działa w suterenie bez zasięgu, zamiast pokazywać puste okno.
 *
 * Wpadka, przed którą to chroni: samo wpięcie Dexie pod zapisy dawało apkę,
 * w której trening da się prowadzić offline, ale nie da się do niego DODAĆ
 * ćwiczenia — czyli offline bezużyteczne dokładnie tam, gdzie miało działać.
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
    // Tylko brak sieci schodzi na zapas lokalny. Błąd 4xx/5xx ma dojść do
    // ekranu jako błąd — udawanie, że „po prostu nic nie znaleziono", ukryłoby
    // zepsuty endpoint.
    if (!(error instanceof OfflineError)) {
      throw error;
    }
    const db = getDatabase();
    return db === null ? [] : searchLocalExercises(db, query);
  }
}
