import type { SaveRoutineRequest } from "@/lib/api/routines";
import type { ExerciseResponse, RoutineResponse, WorkoutDetailResponse } from "@/types/api";

/**
 * Szkic szablonu treningu — czysta struktura, którą edytuje ekran, i czyste
 * funkcje, które ją zmieniają. Komponent układa, nie liczy (konwencja projektu).
 *
 * Nazwa ćwiczenia siedzi w szkicu tylko po to, żeby dało się go narysować bez
 * drugiego zapytania; na serwer leci samo `exerciseId`. Kolejność pozycji jest
 * kolejnością w tablicy — `orderIndex` powstaje dopiero przy wysyłce, bo
 * trzymanie go w szkicu oznaczałoby przenumerowywanie wszystkiego przy każdym
 * przesunięciu wiersza.
 */

/** Granice z `SaveRoutineRequest` po stronie backendu — te same, nie „podobne". */
export const NAME_MAX_LENGTH = 200;
export const NOTES_MAX_LENGTH = 2000;
export const TARGET_SETS_MIN = 1;
export const TARGET_SETS_MAX = 50;
export const TARGET_REPS_MIN = 1;
export const TARGET_REPS_MAX = 100;

export interface RoutineDraftItem {
  /** `id` pozycji z serwera; `null` dla pozycji dodanej w tej edycji. */
  id: string | null;
  exerciseId: string;
  exerciseName: string;
  targetSets: number | null;
  targetReps: number | null;
}

export interface RoutineDraft {
  /** `null` = szablon jeszcze nie istnieje. */
  id: string | null;
  name: string;
  notes: string;
  items: RoutineDraftItem[];
}

export function emptyDraft(): RoutineDraft {
  return { id: null, name: "", notes: "", items: [] };
}

export function draftFromRoutine(routine: RoutineResponse, exerciseNames: ReadonlyMap<string, string>): RoutineDraft {
  return {
    id: routine.id,
    name: routine.name,
    notes: routine.notes ?? "",
    items: [...routine.items]
      .filter((item) => item.deletedAt === null)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => ({
        id: item.id,
        exerciseId: item.exerciseId,
        // Nazwy nie ma w odpowiedzi szablonu (są tam same `exerciseId`).
        // Brak w katalogu = ćwiczenie usunięte albo katalog jeszcze nie doszedł;
        // „?" byłoby gorsze niż uczciwe „ćwiczenie spoza katalogu".
        exerciseName: exerciseNames.get(item.exerciseId) ?? "Ćwiczenie spoza katalogu",
        targetSets: item.targetSets,
        targetReps: item.targetReps,
      })),
  };
}

/**
 * Szkic z zakończonego treningu — „zapisz to, co właśnie zrobiłem, jako plan".
 *
 * Cel serii to liczba serii ROBOCZYCH, bo dokładnie to liczy licznik `0/3` na
 * karcie ćwiczenia; rozgrzewka jest z niego wyłączona tak samo jak z objętości
 * i rekordów. Cel powtórzeń to MEDIANA powtórzeń w seriach roboczych.
 *
 * Nie „wartość najczęstsza": przy stałych seriach (5/5/5) obie reguły dają to
 * samo, ale przy drabinie 3/2/1 każda liczba jest tak samo częsta i remis
 * trzeba rozstrzygać arbitralnie — pierwsza wersja brała najniższą i robiła
 * z sesji plan „3 serie × 1 powtórzenie". Mediana opisuje taką sesję uczciwie
 * (2) i nie wymaga drugiej reguły obok pierwszej.
 */
export function draftFromWorkout(workout: WorkoutDetailResponse, name: string): RoutineDraft {
  return {
    id: null,
    name,
    notes: "",
    items: workout.exercises.map((exercise) => {
      const workingSets = exercise.sets.filter((set) => !set.isWarmup && set.deletedAt === null);
      return {
        id: null,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        targetSets: workingSets.length > 0 ? workingSets.length : null,
        targetReps: medianReps(workingSets.map((set) => set.reps)),
      };
    }),
  };
}

/** Mediana; przy parzystej liczbie serii DOLNY środek — cel ma być całkowity
 *  i raczej do wykonania niż do pobicia, a średnia dałaby „7,5 powtórzenia". */
function medianReps(reps: readonly number[]): number | null {
  if (reps.length === 0) {
    return null;
  }
  const sorted = [...reps].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/* ------------------------------------------------------------------ *
 * Zmiany szkicu
 * ------------------------------------------------------------------ */

export function addItem(draft: RoutineDraft, exercise: ExerciseResponse): RoutineDraft {
  return {
    ...draft,
    items: [
      ...draft.items,
      {
        id: null,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        targetSets: null,
        targetReps: null,
      },
    ],
  };
}

export function removeItem(draft: RoutineDraft, index: number): RoutineDraft {
  return { ...draft, items: draft.items.filter((_, position) => position !== index) };
}

/**
 * Przesunięcie pozycji o jeden. Poza tablicą nie robi nic — brzegowy wiersz
 * ma mieć nieaktywną strzałkę, a nie zapętlać listę.
 */
export function moveItem(draft: RoutineDraft, index: number, offset: -1 | 1): RoutineDraft {
  const target = index + offset;
  if (index < 0 || index >= draft.items.length || target < 0 || target >= draft.items.length) {
    return draft;
  }
  const items = [...draft.items];
  [items[index], items[target]] = [items[target], items[index]];
  return { ...draft, items };
}

export function setItemTarget(
  draft: RoutineDraft,
  index: number,
  patch: Partial<Pick<RoutineDraftItem, "targetSets" | "targetReps">>,
): RoutineDraft {
  return {
    ...draft,
    items: draft.items.map((item, position) => (position === index ? { ...item, ...patch } : item)),
  };
}

/* ------------------------------------------------------------------ *
 * Walidacja i wysyłka
 * ------------------------------------------------------------------ */

/**
 * Puste pole = brak celu (`null`), nie zero. Wartość spoza zakresu jest
 * PRZYCINANA, a nie odrzucana: to stepper obok pola, nie formularz podatkowy,
 * a serwer i tak pilnuje granic.
 */
export function parseTarget(value: string, min: number, max: number): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.min(Math.max(parsed, min), max);
}

/** `null` = szkic da się zapisać. */
export function validateDraft(draft: RoutineDraft): string | null {
  if (draft.name.trim() === "") {
    return "Szablon musi mieć nazwę.";
  }
  if (draft.name.trim().length > NAME_MAX_LENGTH) {
    return `Nazwa może mieć najwyżej ${String(NAME_MAX_LENGTH)} znaków.`;
  }
  if (draft.notes.length > NOTES_MAX_LENGTH) {
    return `Notatka może mieć najwyżej ${String(NOTES_MAX_LENGTH)} znaków.`;
  }
  if (draft.items.length === 0) {
    return "Dodaj przynajmniej jedno ćwiczenie.";
  }
  return null;
}

/**
 * Szkic → żądanie. Wysyłamy KOMPLET pozycji, bo `PUT` podmienia całą listę
 * (`backend/API.md`): pominięta pozycja dostaje tombstone, a nie zostaje po
 * staremu. Różnica byłaby tu cichym kasowaniem.
 */
export function toSaveRequest(draft: RoutineDraft): SaveRoutineRequest {
  return {
    ...(draft.id === null ? {} : { id: draft.id }),
    name: draft.name.trim(),
    notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
    items: draft.items.map((item, index) => ({
      ...(item.id === null ? {} : { id: item.id }),
      exerciseId: item.exerciseId,
      orderIndex: index,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
    })),
  };
}

/** Podsumowanie do wiersza listy: „4 ćwiczenia · 13 serii". */
export function totalTargetSets(routine: RoutineResponse): number {
  return routine.items
    .filter((item) => item.deletedAt === null)
    .reduce((sum, item) => sum + (item.targetSets ?? 0), 0);
}
