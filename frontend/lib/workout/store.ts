"use client";

import { useSyncExternalStore } from "react";
import { exerciseHistory } from "@/lib/api/exercises";
import { getRoutine } from "@/lib/api/routines";
import {
  addWorkoutExercise,
  createWorkout,
  discardWorkout,
  finishWorkout,
  getActiveWorkout,
  removeSet,
  removeWorkoutExercise,
  saveSet,
  updateWorkout,
  updateWorkoutExercise,
} from "@/lib/api/workouts";
import type { OneRepMaxFormula } from "@/lib/metrics";
import {
  emptyDraft,
  isUntouchedDraft,
  withSuggestedWeight,
  type SetDraft,
} from "@/lib/workout/draft";
import { MutationQueue, type FailedMutation } from "@/lib/workout/mutation-queue";
import {
  buildLocalWorkout,
  buildSetResponse,
  buildWorkoutExercise,
  withExercise,
  withSet,
  withSwappedExercise,
  withoutExercise,
  withoutSet,
} from "@/lib/workout/optimistic";
import { clearSnapshot, readSnapshot, writeSnapshot } from "@/lib/workout/persistence";
import { OfflineError } from "@/lib/api/errors";
import { getDatabase } from "@/lib/db/database";
import { cacheExercises } from "@/lib/db/exercise-repository";
import {
  markSetDeleted,
  markWorkoutDeleted,
  markWorkoutExerciseDeleted,
  persistServerWorkout,
  persistWorkout,
  readActiveWorkout,
} from "@/lib/db/workout-repository";
import { refreshPending, requestSync } from "@/lib/sync/engine";
import { rememberExercise } from "@/lib/workout/recent-exercises";
import { validateSetInput } from "@/lib/workout/set-values";
import { uuid } from "@/lib/workout/uuid";
import { readSession } from "@/lib/auth/token-store";
import type {
  ExerciseResponse,
  RoutineResponse,
  SetResponse,
  WorkoutDetailResponse,
} from "@/types/api";

/* ================================================================== *
 * SINGLE PLACE THAT WRITES THE WORKOUT.
 *
 * Every change goes through the same path: (1) optimistic patch on the
 * local snapshot, (2) snapshot write to localStorage, (3) task on the
 * serial queue that calls the API and swaps the snapshot for the server
 * response.
 *
 * Stage 5 added Dexie to this path: the write goes FIRST to the local DB
 * (with `dirty = 1`), only then to the API — requirement from PROMPT §3.5.
 * A closed tab, dead battery and lost signal through the whole workout all
 * end the same way: changes wait in Dexie and go out at the first chance via
 * `POST /api/sync`.
 *
 * REST was **not** replaced by sync. The online write still goes through
 * REST, because only it returns the computed `personalRecordsBrokenIn` and
 * volumes — the sync batch returns raw records. The backend designed these
 * two paths together (backend/CLAUDE.md, "Two write paths for the same data");
 * they differ in who sets `updatedAt`, not in what they write.
 *
 * No component knows where the write goes.
 * ================================================================== */

export type WorkoutStatus = "idle" | "loading" | "empty" | "ready";

export interface ExerciseReference {
  status: "loading" | "ready";
  /** Sets from the last session of this exercise BEFORE the current one — the "last:" line. */
  sets: { weightKg: number; reps: number }[];
}

export interface PendingUndo {
  workoutExerciseId: string;
  set: SetResponse;
  token: number;
}

export interface WorkoutState {
  status: WorkoutStatus;
  workout: WorkoutDetailResponse | null;
  /** At most one draft per exercise; key = `workoutExerciseId`. */
  drafts: Record<string, SetDraft>;
  /** Expanded (edited) set row — the only one on screen. */
  activeExerciseId: string | null;
  /** Key = `exerciseId` from the catalog. */
  references: Record<string, ExerciseReference>;
  /** `exerciseId` → `targetSets` from the template, for the `0/3` counter. */
  routineTargets: Record<string, number>;
  /** Template name for the context bar; `null` when the workout starts empty. */
  routineName: string | null;
  pending: number;
  failed: FailedMutation[];
  undo: PendingUndo | null;
  /** The finish sheet is opened by TWO places (the button at the end of the list
   * and the session ⋮ in the top bar), which have no common parent — hence the
   * flag here instead of threading props through the app shell. */
  finishSheetOpen: boolean;
  /** Last error from an operation that cannot be retried silently (e.g. workout start). */
  error: string | null;
}

const INITIAL: WorkoutState = {
  status: "idle",
  workout: null,
  drafts: {},
  activeExerciseId: null,
  references: {},
  routineTargets: {},
  routineName: null,
  pending: 0,
  failed: [],
  undo: null,
  finishSheetOpen: false,
  error: null,
};

let state: WorkoutState = INITIAL;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<WorkoutState>): void {
  state = { ...state, ...patch };
  notify();
}

function currentUserId(): string {
  return readSession()?.userId ?? "";
}

/**
 * The `localStorage` snapshot STAYS alongside Dexie and is not a duplicate by
 * oversight: it is synchronous, so the resumed-workout screen is complete on
 * the first frame, before the async read from IndexedDB has time to return.
 * Both copies come from the same `state.workout` written by `commit()`, so
 * they cannot diverge. Dexie is the durable store and the source for sync;
 * `localStorage` is strictly a screen cache.
 */
function persist(): void {
  writeSnapshot(currentUserId(), state.workout);
}

/**
 * Local workout write. `dirtyIds` are rows the user just changed —
 * only they go into the outgoing queue; the rest keep their flag.
 *
 * Missing IndexedDB (private mode in some browsers) must not break the
 * workout: the app keeps working online, it only loses offline resilience.
 */
function persistLocal(dirtyIds: readonly string[]): void {
  const db = getDatabase();
  const workout = state.workout;
  if (db === null || workout === null) {
    return;
  }
  void persistWorkout(db, workout, new Set(dirtyIds))
    .then(() => refreshPending())
    .catch(() => undefined);
}

/** Local tombstone — a deletion must reach the other device. */
function persistTombstone(run: (db: NonNullable<ReturnType<typeof getDatabase>>) => Promise<void>): void {
  const db = getDatabase();
  if (db === null) {
    return;
  }
  void run(db)
    .then(() => refreshPending())
    .catch(() => undefined);
}

/** Snapshot + drafts in one step so half of it can never be written. */
function commit(patch: Partial<WorkoutState>): void {
  setState(patch);
  persist();
}

const queue = new MutationQueue((status) => {
  setState({ pending: status.pending, failed: status.failed });
});

/**
 * Sending a single change. The server response (the whole `WorkoutDetailResponse`)
 * replaces the snapshot, but **only when nothing else is waiting in the queue** —
 * otherwise the response to set no. 2 would rewind on screen set no. 3, which the
 * user just confirmed. The last response in a series contains the complete state anyway.
 */
function submit(
  id: string,
  label: string,
  dirtyIds: readonly string[],
  run: () => Promise<WorkoutDetailResponse | void>,
): void {
  // Dexie BEFORE the network. If the order were reversed, closing the tab
  // while a request is in flight would lose the set the user already sees on screen.
  persistLocal(dirtyIds);

  queue.submit({
    id,
    label,
    run: async () => {
      const detail = await run();
      if (detail === undefined) {
        return;
      }
      // The server response is the state the server holds — these rows
      // stop waiting in the outgoing queue.
      const db = getDatabase();
      if (db !== null) {
        await persistServerWorkout(db, detail).catch(() => undefined);
        // Wait for the counter to recompute: the queue reports "empty" only
        // after returning from `run()`, so the pill never sees the intermediate
        // "nothing in flight, but something pending" state.
        await refreshPending();
      }
      if (queue.remaining() === 0) {
        commit({ workout: detail });
      }
    },
  });
}

export function openFinishSheet(): void {
  setState({ finishSheetOpen: true });
}

export function closeFinishSheet(): void {
  setState({ finishSheetOpen: false });
}

export function retryFailedMutations(): void {
  queue.retryAll();
}

if (typeof window !== "undefined") {
  // Network coming back retries pending writes on its own. Making the user click
  // "Retry" when the browser just said "I have signal" is doing the app's homework.
  window.addEventListener("online", () => {
    queue.retryAll();
    // The in-memory queue retries what this tab remembers. Rows in Dexie
    // (e.g. from a session before the tab closed) are picked up by sync.
    void requestSync();
  });
}

/* ------------------------------------------------------------------ *
 * Screen entry
 * ------------------------------------------------------------------ */

let loadToken = 0;

/**
 * Entering `/trening`. First the local snapshot (the screen is complete right
 * away, even without network), then `GET /api/workouts/active` as reconciliation.
 * `204` = no open workout → empty state. No "resume?" prompt — the session simply
 * continues (spec §2).
 */
export async function loadActiveWorkout(formula: OneRepMaxFormula): Promise<void> {
  const token = (loadToken += 1);
  const cached = readSnapshot(currentUserId());
  if (cached !== null) {
    setState({ status: "ready", workout: cached.workout });
  } else if (state.workout === null) {
    setState({ status: "loading" });
  }

  // Durable local state. The `localStorage` snapshot is lost when site data
  // is cleared and is absent in a freshly opened tab — Dexie survives both.
  if (cached === null) {
    const db = getDatabase();
    if (db !== null) {
      const local = await readActiveWorkout(db, formula).catch(() => null);
      if (token === loadToken && local !== null && state.workout === null) {
        setState({ status: "ready", workout: local });
      }
    }
  }

  try {
    const detail = await getActiveWorkout(formula);
    if (token !== loadToken) {
      return;
    }
    if (detail === null) {
      // NOTE: without an `else` below, this branch used to `return` and skip
      // the `requestSync()` at the end of the function — meaning in the most
      // common case (no open workout) sync did not start at all.
      await handleNoActiveWorkoutOnServer(token, formula);
    } else {
      commit({ status: "ready", workout: detail, error: null });
      const db = getDatabase();
      if (db !== null) {
        void persistServerWorkout(db, detail).catch(() => undefined);
      }
      void loadRoutineTargets(detail);
      void loadReferences(detail, formula);
    }
  } catch {
    if (token !== loadToken) {
      return;
    }
    // No network: if we have a snapshot or rows in Dexie, the screen keeps working;
    // otherwise — empty state with the option to start a workout offline.
    setState({ status: state.workout === null ? "empty" : "ready" });
  }

  // Entering the screen is a good moment to catch up on arrears.
  void requestSync();
}

/**
 * The server says "no open workout" (204). This does NOT automatically mean the
 * screen should be cleared: a workout started without signal exists only locally,
 * so the server does not know about it and has no right to erase it. A naive
 * state clear here would wipe out the whole offline gym session.
 *
 * So if Dexie has an open workout, we leave it on screen and push it to the
 * server. If not — 204 means exactly what it says.
 */
async function handleNoActiveWorkoutOnServer(
  token: number,
  formula: OneRepMaxFormula,
): Promise<void> {
  const db = getDatabase();
  const local = db === null ? null : await readActiveWorkout(db, formula).catch(() => null);
  if (token !== loadToken) {
    return;
  }
  if (local !== null) {
    commit({ status: "ready", workout: local, error: null });
    void requestSync();
    return;
  }
  clearSnapshot();
  setState({ status: "empty", workout: null, drafts: {}, activeExerciseId: null });
}

/** Entering any app screen: the workout loads once, because the shell shows
 * the "Workout in progress" bar outside `/trening` too. */
export function ensureActiveWorkoutLoaded(formula: OneRepMaxFormula): void {
  if (state.status === "idle") {
    void loadActiveWorkout(formula);
  }
}

/** The template carries `targetSets`, which `WorkoutExerciseResponse` does not —
 * hence fetching the routine so the card header can show `0/3`. */
async function loadRoutineTargets(workout: WorkoutDetailResponse): Promise<void> {
  if (workout.routineId === null) {
    return;
  }
  try {
    const routine = await getRoutine(workout.routineId);
    const targets: Record<string, number> = {};
    for (const item of routine.items) {
      if (item.targetSets !== null) {
        targets[item.exerciseId] = item.targetSets;
      }
    }
    setState({ routineTargets: targets, routineName: routine.name });
  } catch {
    /* the 0/3 counter is decoration, missing it must not break the screen */
  }
}

async function loadReferences(
  workout: WorkoutDetailResponse,
  formula: OneRepMaxFormula,
): Promise<void> {
  await Promise.all(
    workout.exercises.map((exercise) =>
      ensureReference(exercise.exerciseId, workout.id, formula),
    ),
  );
}

/**
 * The "last: 100 × 5" line. The current session is cut out of history —
 * otherwise, after a page refresh, a set done five minutes ago would become
 * the reference.
 */
export async function ensureReference(
  exerciseId: string,
  currentWorkoutId: string,
  formula: OneRepMaxFormula,
): Promise<void> {
  if (state.references[exerciseId] !== undefined) {
    return;
  }
  setState({
    references: { ...state.references, [exerciseId]: { status: "loading", sets: [] } },
  });
  try {
    const history = await exerciseHistory(exerciseId, { limit: 5, formula });
    const previous = history.sessions
      .filter((session) => session.workoutId !== currentWorkoutId)
      .at(-1);
    const sets = (previous?.sets ?? []).map((set) => ({
      weightKg: set.weightKg,
      reps: set.reps,
    }));
    setState({
      references: {
        ...state.references,
        [exerciseId]: { status: "ready", sets },
      },
      // History arrives after the set row is already on screen, so the weight
      // suggestion kicks in only NOW — and only on drafts nobody touched in
      // the meantime.
      drafts: suggestWeights(state.drafts, exerciseId, sets),
    });
  } catch {
    setState({
      references: { ...state.references, [exerciseId]: { status: "ready", sets: [] } },
    });
  }
}

/**
 * Inserts a weight suggestion into this exercise's drafts. The set number comes
 * from the number of sets already done in this session — the second set looks
 * at the second set of the previous workout, the same way the "last: 100 × 5"
 * line does.
 */
function suggestWeights(
  drafts: Record<string, SetDraft>,
  exerciseId: string,
  sets: readonly { weightKg: number; reps: number }[],
): Record<string, SetDraft> {
  if (sets.length === 0) {
    return drafts;
  }
  const workout = state.workout;
  if (workout === null) {
    return drafts;
  }

  let changed = false;
  const next = { ...drafts };
  for (const exercise of workout.exercises) {
    if (exercise.exerciseId !== exerciseId) {
      continue;
    }
    const draft = drafts[exercise.id];
    if (draft === undefined || !isUntouchedDraft(draft)) {
      continue;
    }
    const setIndex = exercise.sets.filter((set) => set.deletedAt === null).length;
    const suggestion = sets[Math.min(setIndex, sets.length - 1)];
    next[exercise.id] = withSuggestedWeight(draft, suggestion.weightKg);
    changed = true;
  }
  return changed ? next : drafts;
}

/* ------------------------------------------------------------------ *
 * Workout start
 * ------------------------------------------------------------------ */

function startWorkout(routineId: string | null, applyRoutine: boolean): void {
  const id = uuid();
  const startedAt = new Date().toISOString();
  const local = buildLocalWorkout(id, startedAt, routineId);
  commit({
    status: "ready",
    workout: local,
    drafts: {},
    activeExerciseId: null,
    references: {},
    routineTargets: {},
    routineName: null,
    error: null,
  });
  submit(`workout:${id}`, "Rozpoczęcie treningu", [id], () =>
    createWorkout({
      id,
      startedAt,
      routineId: routineId ?? undefined,
      applyRoutine: applyRoutine ? true : undefined,
    }),
  );
}

export function startEmptyWorkout(): void {
  startWorkout(null, false);
}

export function startWorkoutFromRoutine(routine: RoutineResponse): void {
  startWorkout(routine.id, true);
  const targets: Record<string, number> = {};
  for (const item of routine.items) {
    if (item.targetSets !== null) {
      targets[item.exerciseId] = item.targetSets;
    }
  }
  setState({ routineTargets: targets, routineName: routine.name });
}

/* ------------------------------------------------------------------ *
 * Exercises
 * ------------------------------------------------------------------ */

export function addExerciseToWorkout(
  exercise: ExerciseResponse,
  formula: OneRepMaxFormula,
): string | null {
  const workout = state.workout;
  if (workout === null) {
    return null;
  }
  const id = uuid();
  const orderIndex = workout.exercises.length;
  const now = new Date().toISOString();
  const local = buildWorkoutExercise(id, workout, exercise, orderIndex, now);
  const draft = emptyDraft(uuid(), id);

  const reference = state.references[exercise.id];
  commit({
    workout: withExercise(workout, local),
    // When the history for this exercise is already in memory (a second attempt
    // in the same session), the suggestion kicks in immediately, no waiting
    // for the network.
    drafts: {
      ...state.drafts,
      [id]:
        reference?.status === "ready" && reference.sets.length > 0
          ? withSuggestedWeight(draft, reference.sets[0].weightKg)
          : draft,
    },
    activeExerciseId: id,
  });
  rememberExercise(exercise.id);
  const db = getDatabase();
  if (db !== null) {
    // Without this, a workout resumed offline would show an exercise with no
    // name: `workout_exercises` only carries `exerciseId`.
    void cacheExercises(db, [exercise]).catch(() => undefined);
  }
  void ensureReference(exercise.id, workout.id, formula);

  submit(`exercise:${id}`, `Dodanie ćwiczenia „${exercise.name}"`, [id], () =>
    addWorkoutExercise(workout.id, { id, exerciseId: exercise.id, orderIndex }),
  );
  return id;
}

export function removeExerciseFromWorkout(workoutExerciseId: string): void {
  const workout = state.workout;
  if (workout === null) {
    return;
  }
  const exercise = workout.exercises.find((candidate) => candidate.id === workoutExerciseId);
  commit({
    workout: withoutExercise(workout, workoutExerciseId),
    drafts: withoutDraft(state.drafts, workoutExerciseId),
    activeExerciseId: state.activeExerciseId === workoutExerciseId ? null : state.activeExerciseId,
  });
  // The snapshot no longer contains this exercise, so `persistWorkout` would
  // not touch it — we write the tombstone directly, together with the cascade
  // onto the sets.
  const deletedAt = new Date().toISOString();
  persistTombstone((db) => markWorkoutExerciseDeleted(db, workoutExerciseId, deletedAt));
  submit(
    `exercise-delete:${workoutExerciseId}`,
    `Usunięcie ćwiczenia „${exercise?.exerciseName ?? ""}"`,
    [],
    () => removeWorkoutExercise(workout.id, workoutExerciseId),
  );
}

/**
 * Swapping an exercise mid-workout — without removing the card and adding
 * a new one at the end (the former only path). The old exercise's sets go
 * away with it: they stay as tombstones, like with a normal set deletion.
 */
export function swapExercise(
  workoutExerciseId: string,
  exercise: ExerciseResponse,
  formula: OneRepMaxFormula,
): void {
  const workout = state.workout;
  if (workout === null) {
    return;
  }
  const current = workout.exercises.find((candidate) => candidate.id === workoutExerciseId);
  if (current === undefined || current.exerciseId === exercise.id) {
    return;
  }
  const removedSetIds = current.sets.map((set) => set.id);
  const now = new Date().toISOString();
  const swapped = withSwappedExercise(current, exercise, now);

  commit({
    workout: {
      ...workout,
      exercises: workout.exercises.map((candidate) =>
        candidate.id === workoutExerciseId ? swapped : candidate,
      ),
    },
    drafts: {
      ...state.drafts,
      [workoutExerciseId]: emptyDraft(uuid(), workoutExerciseId),
    },
  });
  rememberExercise(exercise.id);
  const db = getDatabase();
  if (db !== null) {
    void cacheExercises(db, [exercise]).catch(() => undefined);
  }
  void ensureReference(exercise.id, workout.id, formula);

  const deletedAt = now;
  for (const setId of removedSetIds) {
    persistTombstone((db) => markSetDeleted(db, setId, deletedAt));
  }

  submit(
    `exercise-swap:${workoutExerciseId}`,
    `Zmiana ćwiczenia na „${exercise.name}"`,
    [workoutExerciseId],
    async () => {
      for (const setId of removedSetIds) {
        await removeSet(workout.id, workoutExerciseId, setId);
      }
      return updateWorkoutExercise(workout.id, workoutExerciseId, {
        exerciseId: exercise.id,
        orderIndex: current.orderIndex,
        notes: current.notes,
      });
    },
  );
}

export function setExerciseNotes(workoutExerciseId: string, notes: string): void {
  const workout = state.workout;
  if (workout === null) {
    return;
  }
  commit({
    workout: {
      ...workout,
      exercises: workout.exercises.map((exercise) =>
        exercise.id === workoutExerciseId ? { ...exercise, notes } : exercise,
      ),
    },
  });
  const exercise = workout.exercises.find((candidate) => candidate.id === workoutExerciseId);
  if (exercise === undefined) {
    return;
  }
  submit(`exercise-notes:${workoutExerciseId}`, "Notatka do ćwiczenia", [workoutExerciseId], () =>
    updateWorkoutExercise(workout.id, workoutExerciseId, {
      exerciseId: exercise.exerciseId,
      orderIndex: exercise.orderIndex,
      notes,
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Set drafts
 * ------------------------------------------------------------------ */

function withoutDraft(
  drafts: Record<string, SetDraft>,
  workoutExerciseId: string,
): Record<string, SetDraft> {
  const next: Record<string, SetDraft> = {};
  for (const [key, value] of Object.entries(drafts)) {
    if (key !== workoutExerciseId) {
      next[key] = value;
    }
  }
  return next;
}

export function setActiveExercise(workoutExerciseId: string | null): void {
  setState({ activeExerciseId: workoutExerciseId });
}

/** A new empty row, optionally pre-filled with the previous set. */
export function beginNewSet(
  workoutExerciseId: string,
  seed?: { weight: string; reps: string; isWarmup?: boolean },
): void {
  const draft: SetDraft = {
    ...emptyDraft(uuid(), workoutExerciseId),
    weight: seed?.weight ?? "",
    reps: seed?.reps ?? "",
    isWarmup: seed?.isWarmup ?? false,
  };
  commit({
    drafts: { ...state.drafts, [workoutExerciseId]: draft },
    activeExerciseId: workoutExerciseId,
  });
}

/** Tap on a confirmed row — same `id`, so ✓ does an upsert, not a duplicate. */
export function editSet(workoutExerciseId: string, set: SetResponse): void {
  const draft: SetDraft = {
    id: set.id,
    workoutExerciseId,
    weight: String(set.weightKg),
    reps: String(set.reps),
    rpe: set.rpe,
    isWarmup: set.isWarmup,
    toFailure: set.toFailure,
    assisted: set.assisted,
    editing: true,
    submitAttempted: false,
  };
  commit({
    drafts: { ...state.drafts, [workoutExerciseId]: draft },
    activeExerciseId: workoutExerciseId,
  });
}

export function updateDraft(workoutExerciseId: string, patch: Partial<SetDraft>): void {
  const current = state.drafts[workoutExerciseId];
  if (current === undefined) {
    return;
  }
  commit({ drafts: { ...state.drafts, [workoutExerciseId]: { ...current, ...patch } } });
}

export function discardDraft(workoutExerciseId: string): void {
  commit({
    drafts: withoutDraft(state.drafts, workoutExerciseId),
    activeExerciseId: state.activeExerciseId === workoutExerciseId ? null : state.activeExerciseId,
  });
}

export interface ConfirmResult {
  set: SetResponse;
  /** `exerciseId` from the catalog — needed for per-exercise rest time. */
  exerciseId: string;
}

/**
 * ✓ Confirm. Write + collapse the row + a next empty row pre-filled with the
 * same values. The timer is started by the caller (the component knows the
 * rest preferences), because the store should not know device settings.
 */
export function confirmDraft(
  workoutExerciseId: string,
  formula: OneRepMaxFormula,
): ConfirmResult | null {
  const workout = state.workout;
  const draft = state.drafts[workoutExerciseId];
  if (workout === null || draft === undefined) {
    return null;
  }
  const validation = validateSetInput(draft.weight, draft.reps, draft.rpe);
  if (validation.values === null) {
    updateDraft(workoutExerciseId, { submitAttempted: true });
    return null;
  }
  const exercise = workout.exercises.find((candidate) => candidate.id === workoutExerciseId);
  if (exercise === undefined) {
    return null;
  }

  const existingIndex = exercise.sets.findIndex((set) => set.id === draft.id);
  const setIndex = existingIndex >= 0 ? existingIndex : exercise.sets.length;
  const now = new Date().toISOString();
  const set = buildSetResponse(
    workoutExerciseId,
    setIndex,
    {
      id: draft.id,
      weightKg: validation.values.weightKg,
      reps: validation.values.reps,
      rpe: validation.values.rpe,
      isWarmup: draft.isWarmup,
      toFailure: draft.toFailure,
      assisted: draft.assisted,
    },
    formula,
    now,
  );

  // The next row ready immediately with the same values: 5×5 is five taps on ✓,
  // not five form fills. It does not get autofocus — the keyboard during the
  // rest would cover half the screen.
  const next: SetDraft = {
    ...emptyDraft(uuid(), workoutExerciseId),
    weight: String(set.weightKg),
    reps: String(set.reps),
  };

  commit({
    workout: withSet(workout, workoutExerciseId, set),
    drafts: { ...state.drafts, [workoutExerciseId]: next },
    activeExerciseId: workoutExerciseId,
  });

  submit(`set:${set.id}`, `Zapis serii ${setIndex + 1}`, [set.id], () =>
    saveSet(workout.id, workoutExerciseId, set.id, {
      setIndex,
      weightKg: set.weightKg,
      reps: set.reps,
      rpe: set.rpe,
      isWarmup: set.isWarmup,
      toFailure: set.toFailure,
      assisted: set.assisted,
      completedAt: set.completedAt,
    }),
  );

  return { set, exerciseId: exercise.exerciseId };
}

/* ------------------------------------------------------------------ *
 * Deleting a set (soft delete + Undo)
 * ------------------------------------------------------------------ */

let undoToken = 0;

export function deleteSet(workoutExerciseId: string, setId: string): void {
  const workout = state.workout;
  if (workout === null) {
    return;
  }
  const exercise = workout.exercises.find((candidate) => candidate.id === workoutExerciseId);
  const set = exercise?.sets.find((candidate) => candidate.id === setId);
  if (set === undefined) {
    return;
  }
  const token = (undoToken += 1);
  commit({
    workout: withoutSet(workout, workoutExerciseId, setId),
    undo: { workoutExerciseId, set, token },
  });
  const deletedAt = new Date().toISOString();
  persistTombstone((db) => markSetDeleted(db, setId, deletedAt));
  submit(`set-delete:${setId}`, `Usunięcie serii ${set.setIndex + 1}`, [], () =>
    removeSet(workout.id, workoutExerciseId, setId),
  );
  setTimeout(() => {
    if (state.undo?.token === token) {
      setState({ undo: null });
    }
  }, 8_000);
}

/** `PUT` with the same `id` clears the tombstone (verified against the live API). */
export function undoDeleteSet(): void {
  const workout = state.workout;
  const undo = state.undo;
  if (workout === null || undo === null) {
    return;
  }
  const exercise = workout.exercises.find(
    (candidate) => candidate.id === undo.workoutExerciseId,
  );
  if (exercise === undefined) {
    setState({ undo: null });
    return;
  }
  const setIndex = Math.min(undo.set.setIndex, exercise.sets.length);
  const restored = { ...undo.set, setIndex };
  commit({
    workout: withSet(workout, undo.workoutExerciseId, restored),
    undo: null,
  });
  submit(`set:${restored.id}`, `Przywrócenie serii ${setIndex + 1}`, [restored.id], () =>
    saveSet(workout.id, undo.workoutExerciseId, restored.id, {
      setIndex,
      weightKg: restored.weightKg,
      reps: restored.reps,
      rpe: restored.rpe,
      isWarmup: restored.isWarmup,
      toFailure: restored.toFailure,
      assisted: restored.assisted,
      completedAt: restored.completedAt,
    }),
  );
}

export function dismissUndo(): void {
  setState({ undo: null });
}

/* ------------------------------------------------------------------ *
 * Workout as a whole
 * ------------------------------------------------------------------ */

export function setDeload(isDeload: boolean): void {
  const workout = state.workout;
  if (workout === null) {
    return;
  }
  commit({ workout: { ...workout, isDeload } });
  submit(`workout-deload:${workout.id}`, "Oznaczenie deloadu", [workout.id], () =>
    updateWorkout(workout.id, { isDeload }),
  );
}

export function setWorkoutNotes(notes: string): void {
  const workout = state.workout;
  if (workout === null) {
    return;
  }
  commit({ workout: { ...workout, notes } });
  submit(`workout-notes:${workout.id}`, "Notatka do treningu", [workout.id], () =>
    updateWorkout(workout.id, { notes }),
  );
}

/**
 * Finishing waits for the server — otherwise the summary would have to guess
 * `personalRecordsBrokenIn`, and that is the one number on this screen the
 * browser cannot compute without the full history.
 */
export async function finishActiveWorkout(): Promise<WorkoutDetailResponse | null> {
  const workout = state.workout;
  if (workout === null) {
    return null;
  }
  try {
    const detail = await finishWorkout(workout.id);
    const db = getDatabase();
    if (db !== null) {
      await persistServerWorkout(db, detail).catch(() => undefined);
    }
    clearActiveWorkoutState();
    return detail;
  } catch (error) {
    if (!(error instanceof OfflineError)) {
      setState({
        error: error instanceof Error ? error.message : "Nie udało się zakończyć treningu",
      });
      return null;
    }
    // Offline, the workout must be closeable anyway — this is the most common
    // moment of the whole gym-in-the-basement session. We finish locally:
    // `endedAt` lands in Dexie with `dirty = 1` and will be delivered by sync.
    //
    // The summary will then show everything except the record badges:
    // `personalRecordsBrokenIn` depends on the whole exercise history, which
    // the browser does not have. Guessing locally would give a "PR" that
    // disappears after sync — better to show them late than falsely.
    const endedAt = new Date().toISOString();
    const finished: WorkoutDetailResponse = {
      ...workout,
      endedAt,
      durationSeconds: Math.round((Date.parse(endedAt) - Date.parse(workout.startedAt)) / 1000),
      updatedAt: endedAt,
      personalRecordsBrokenIn: [],
    };
    commit({ workout: finished });
    persistLocal([workout.id]);
    clearActiveWorkoutState();
    void requestSync();
    return finished;
  }
}

/** The screen returns to the "no workout" state. State only, no write. */
function clearActiveWorkoutState(): void {
  clearSnapshot();
  setState({
    status: "empty",
    workout: null,
    drafts: {},
    activeExerciseId: null,
    undo: null,
    finishSheetOpen: false,
    references: {},
    routineTargets: {},
    routineName: null,
  });
}

export async function discardActiveWorkout(): Promise<void> {
  const workout = state.workout;
  clearActiveWorkoutState();
  if (workout === null) {
    return;
  }
  // The local tombstone ALWAYS, regardless of whether the request goes through.
  // Without it, a workout discarded offline would come back on screen at the
  // first sync, because the server would still consider it open.
  const deletedAt = new Date().toISOString();
  persistTombstone((db) => markWorkoutDeleted(db, workout.id, deletedAt));
  try {
    await discardWorkout(workout.id);
  } catch {
    // The deletion will be delivered by the sync batch — the tombstone waits in Dexie.
    void requestSync();
  }
}

/**
 * Deleting a workout from HISTORY (session added by mistake). Same path as
 * discarding the active workout: a tombstone in Dexie always, request if
 * possible, lack of signal delivered by the sync batch.
 *
 * A workout in progress shows up in the history list (`durationSeconds: null`),
 * so a workout deleted from there must also disappear from the workout screen —
 * otherwise it would stay in the `localStorage` snapshot and come back on the
 * next entry to the tab.
 *
 * An error other than no-signal propagates to the caller: the tombstone waits
 * in Dexie anyway, but the user has the right to know the server did not
 * accept it.
 */
export async function deleteWorkoutById(id: string): Promise<void> {
  if (state.workout !== null && state.workout.id === id) {
    await discardActiveWorkout();
    return;
  }
  const deletedAt = new Date().toISOString();
  persistTombstone((db) => markWorkoutDeleted(db, id, deletedAt));
  try {
    await discardWorkout(id);
  } catch (cause) {
    if (cause instanceof OfflineError) {
      void requestSync();
      return;
    }
    throw cause;
  }
}

/* ------------------------------------------------------------------ *
 * React
 * ------------------------------------------------------------------ */

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): WorkoutState {
  return state;
}

function getServerSnapshot(): WorkoutState {
  return INITIAL;
}

export function useWorkoutState(): WorkoutState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The mere fact that a workout is in progress — primitive, so the nav bar does not re-render on every set. */
export function useHasActiveWorkout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.workout !== null,
    () => false,
  );
}

export function useActiveWorkoutStartedAt(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => state.workout?.startedAt ?? null,
    () => null,
  );
}

/** Clearing on logout — someone else's workout must not stay on the device. */
export function resetWorkoutStore(): void {
  clearSnapshot();
  state = INITIAL;
  notify();
}
