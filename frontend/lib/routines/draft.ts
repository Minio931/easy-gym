import type { SaveRoutineRequest } from "@/lib/api/routines";
import type { ExerciseResponse, RoutineResponse, WorkoutDetailResponse } from "@/types/api";

/**
 * Workout-template draft — a pure structure the screen edits, and pure
 * functions that change it. The component lays things out, it does not
 * compute (project convention).
 *
 * The exercise name sits in the draft only so it can be drawn without a
 * second request; only `exerciseId` goes to the server. Item order is the
 * array order — `orderIndex` is produced only on send, because keeping it
 * in the draft would mean renumbering everything on every row move.
 */

/** Bounds from `SaveRoutineRequest` on the backend — the same, not "similar". */
export const NAME_MAX_LENGTH = 200;
export const NOTES_MAX_LENGTH = 2000;
export const TARGET_SETS_MIN = 1;
export const TARGET_SETS_MAX = 50;
export const TARGET_REPS_MIN = 1;
export const TARGET_REPS_MAX = 100;

export interface RoutineDraftItem {
  /** Server-side item `id`; `null` for items added in this edit. */
  id: string | null;
  exerciseId: string;
  exerciseName: string;
  targetSets: number | null;
  targetReps: number | null;
}

export interface RoutineDraft {
  /** `null` = the template does not exist yet. */
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
        // The name is not in the template response (only `exerciseId`).
        // Missing in the catalog = the exercise was deleted or the catalog
        // has not arrived yet; "?" would be worse than an honest
        // "exercise outside the catalog".
        exerciseName: exerciseNames.get(item.exerciseId) ?? "Ćwiczenie spoza katalogu",
        targetSets: item.targetSets,
        targetReps: item.targetReps,
      })),
  };
}

/**
 * Draft from a finished workout — "save what I just did as a plan".
 *
 * The target set count is the number of WORKING sets, because that is
 * exactly what the `0/3` counter on the exercise card tracks; the warmup is
 * excluded from it, same as from volume and records. The target rep count
 * is the MEDIAN of reps across working sets.
 *
 * Not "the mode value": for uniform sets (5/5/5) both rules yield the same,
 * but for a 3/2/1 drop set each number is equally frequent and the tie
 * must be broken arbitrarily — an earlier version took the lowest and
 * turned the session into a plan of "3 sets × 1 rep". The median describes
 * such a session honestly (2) and does not need a second rule beside the
 * first.
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

/** Median; with an even number of sets the LOWER middle — the target
 *  should be an integer and more for executing than for beating, and the
 *  average would give "7.5 reps". */
function medianReps(reps: readonly number[]): number | null {
  if (reps.length === 0) {
    return null;
  }
  const sorted = [...reps].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/* ------------------------------------------------------------------ *
 * Draft mutations
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
 * Move an item by one. Outside the array it does nothing — the edge row
 * should have a disabled arrow, not wrap the list.
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
 * Validation and send
 * ------------------------------------------------------------------ */

/**
 * Empty field = no target (`null`), not zero. A value outside the range is
 * CLAMPED, not rejected: this is a stepper beside the field, not a tax
 * form, and the server guards the bounds anyway.
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

/** `null` = the draft is saveable. */
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
 * Draft → request. We send the FULL item list, because `PUT` replaces the
 * whole list (`backend/API.md`): an omitted item receives a tombstone, it
 * is not left as is. A diff here would be a silent deletion.
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

/** Summary for the list row: "4 ćwiczenia · 13 serii". */
export function totalTargetSets(routine: RoutineResponse): number {
  return routine.items
    .filter((item) => item.deletedAt === null)
    .reduce((sum, item) => sum + (item.targetSets ?? 0), 0);
}
