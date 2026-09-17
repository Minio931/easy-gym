import { CLEAN, DIRTY, type EasyGymDatabase, type LocalExercise } from "@/lib/db/schema";
import type { ExerciseResponse } from "@/types/api";

/**
 * Katalog ćwiczeń w lokalnej bazie. Wypełnia się z dwóch stron: z odpowiedzi
 * `GET /api/exercises` (gdy jest sieć) i z zaciągu `POST /api/sync`. Dzięki temu
 * po jednym udanym połączeniu wyszukiwarka działa też bez zasięgu.
 */

export async function cacheExercises(
  db: EasyGymDatabase,
  exercises: readonly ExerciseResponse[],
): Promise<void> {
  const rows: LocalExercise[] = [];
  for (const exercise of exercises) {
    const existing = await db.exercises.get(exercise.id);
    // Wersja lokalna czekająca na wysłanie jest nowsza niż to, co wie serwer —
    // nadpisanie jej odpowiedzią z listy skasowałoby zmianę nazwy zrobioną
    // przed chwilą bez zasięgu.
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
 * Wyszukiwanie w lokalnym katalogu — **tylko jako zastępstwo przy braku sieci**.
 *
 * Serwer szuka przez `pg_trgm` i łapie literówki; tutaj jest zwykłe „zawiera",
 * bo przeglądarka nie ma trigramów. To świadomie gorsze wyszukiwanie: bez
 * zasięgu „wyciskanei" nic nie znajdzie, a online znalazłoby wyciskanie.
 * Alternatywą byłoby puste okno wyszukiwarki na siłowni, więc gorsze wygrywa.
 *
 * Porównujemy bez znaków diakrytycznych, żeby „lawka" trafiało w „ławkę" —
 * na telefonie w trakcie serii nikt nie celuje w ogonki.
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
      // Lokalna baza nie przechowuje `userId` (jedna baza = jedno konto), a ten
      // ekran i tak używa tego pola tylko do oznaczenia „globalne, nie edytuj".
      // Offline nikt nie edytuje katalogu, więc `null` jest tu bezpieczne.
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
