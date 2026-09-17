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
 * JEDYNE MIEJSCE, KTÓRE ZAPISUJE TRENING.
 *
 * Każda zmiana idzie tą samą drogą: (1) łatka optymistyczna na lokalnej
 * migawce, (2) zapis migawki do localStorage, (3) zadanie w szeregowej
 * kolejce, które woła API i podmienia migawkę odpowiedzią serwera.
 *
 * Etap 5 dołożył do tej drogi Dexie: zapis idzie NAJPIERW do lokalnej bazy
 * (z `dirty = 1`), dopiero potem do API — wymóg PROMPT §3.5. Zamknięta karta,
 * padnięta bateria i brak zasięgu przez cały trening kończą się tak samo:
 * zmiany czekają w Dexie i jadą przy pierwszej okazji przez `POST /api/sync`.
 *
 * REST **nie** został zastąpiony synchronizacją. Online zapis dalej leci przez
 * REST, bo tylko on oddaje policzone `personalRecordsBrokenIn` i objętości —
 * paczka sync zwraca surowe rekordy. Backend projektował te dwie drogi razem
 * (backend/CLAUDE.md, „Dwie drogi zapisu tych samych danych"); różnią się tym,
 * kto ustawia `updatedAt`, a nie tym, co zapisują.
 *
 * Żaden komponent nie wie, dokąd leci zapis.
 * ================================================================== */

export type WorkoutStatus = "idle" | "loading" | "empty" | "ready";

export interface ExerciseReference {
  status: "loading" | "ready";
  /** Serie z ostatniej sesji tego ćwiczenia PRZED bieżącą — linijka „ostatnio:". */
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
  /** Najwyżej jeden szkic na ćwiczenie; klucz = `workoutExerciseId`. */
  drafts: Record<string, SetDraft>;
  /** Rozwinięty (edytowany) wiersz serii — jedyny taki na ekranie. */
  activeExerciseId: string | null;
  /** Klucz = `exerciseId` z katalogu. */
  references: Record<string, ExerciseReference>;
  /** `exerciseId` → `targetSets` z szablonu, do licznika `0/3`. */
  routineTargets: Record<string, number>;
  /** Nazwa szablonu do paska kontekstu; `null` gdy trening zaczęty od pustego. */
  routineName: string | null;
  pending: number;
  failed: FailedMutation[];
  undo: PendingUndo | null;
  /** Arkusz zakończenia otwierają DWA miejsca (przycisk na końcu listy i ⋮
   * sesji w górnym pasku), które nie mają wspólnego rodzica — stąd flaga tutaj
   * zamiast przepychania propsów przez powłokę aplikacji. */
  finishSheetOpen: boolean;
  /** Ostatni błąd operacji, której nie da się ponowić po cichu (np. start treningu). */
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
 * Migawka w `localStorage` ZOSTAJE obok Dexie i nie jest duplikatem przez
 * niedopatrzenie: jest synchroniczna, więc ekran wznowionego treningu jest
 * pełny w pierwszej klatce, zanim asynchroniczny odczyt z IndexedDB zdąży
 * wrócić. Obie kopie pochodzą z tego samego `state.workout` zapisywanego w
 * `commit()`, więc nie mają jak się rozjechać. Dexie jest zapisem trwałym
 * i źródłem dla synchronizacji; `localStorage` jest wyłącznie cache'em ekranu.
 */
function persist(): void {
  writeSnapshot(currentUserId(), state.workout);
}

/**
 * Zapis lokalny treningu. `dirtyIds` to wiersze, które user właśnie zmienił —
 * tylko one trafiają do kolejki wysyłki; reszta zachowuje swój znacznik.
 *
 * Brak IndexedDB (tryb prywatny w części przeglądarek) nie może wywrócić
 * treningu: apka działa dalej online, traci tylko odporność na brak sieci.
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

/** Tombstone lokalny — skasowanie musi dojechać na drugie urządzenie. */
function persistTombstone(run: (db: NonNullable<ReturnType<typeof getDatabase>>) => Promise<void>): void {
  const db = getDatabase();
  if (db === null) {
    return;
  }
  void run(db)
    .then(() => refreshPending())
    .catch(() => undefined);
}

/** Migawka + szkice w jednym kroku, żeby nie dało się zapisać połowy. */
function commit(patch: Partial<WorkoutState>): void {
  setState(patch);
  persist();
}

const queue = new MutationQueue((status) => {
  setState({ pending: status.pending, failed: status.failed });
});

/**
 * Wysyłka pojedynczej zmiany. Odpowiedź serwera (cały `WorkoutDetailResponse`)
 * podmienia migawkę, ale **tylko gdy nic więcej nie czeka w kolejce** — inaczej
 * odpowiedź na serię nr 2 cofnęłaby na ekranie serię nr 3, którą user właśnie
 * zatwierdził. Ostatnia odpowiedź w serii i tak zawiera komplet.
 */
function submit(
  id: string,
  label: string,
  dirtyIds: readonly string[],
  run: () => Promise<WorkoutDetailResponse | void>,
): void {
  // Dexie PRZED siecią. Gdyby kolejność była odwrotna, zamknięcie karty w
  // trakcie lotu żądania gubiłoby serię, którą user widzi już na ekranie.
  persistLocal(dirtyIds);

  queue.submit({
    id,
    label,
    run: async () => {
      const detail = await run();
      if (detail === undefined) {
        return;
      }
      // Odpowiedź serwera to stan, który serwer ma u siebie — te wiersze
      // przestają czekać w kolejce wysyłki.
      const db = getDatabase();
      if (db !== null) {
        await persistServerWorkout(db, detail).catch(() => undefined);
        // Czekamy na przeliczenie licznika: kolejka zgłosi „pusto" dopiero po
        // powrocie z `run()`, więc pigułka nigdy nie zobaczy stanu pośredniego
        // „nic nie leci, a coś czeka".
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
  // Powrót sieci ponawia zaległe zapisy sam. Kazanie użytkownikowi klikać
  // „Ponów", gdy przeglądarka właśnie powiedziała „mam zasięg", jest pracą
  // domową za aplikację.
  window.addEventListener("online", () => {
    queue.retryAll();
    // Kolejka w pamięci ponawia to, co pamięta ta zakładka. Wiersze z Dexie
    // (np. z sesji sprzed zamknięcia karty) zabiera synchronizacja.
    void requestSync();
  });
}

/* ------------------------------------------------------------------ *
 * Wejście na ekran
 * ------------------------------------------------------------------ */

let loadToken = 0;

/**
 * Wejście na `/trening`. Najpierw lokalna migawka (ekran jest pełny od razu,
 * także bez sieci), potem `GET /api/workouts/active` jako uzgodnienie.
 * `204` = nie ma otwartego treningu → stan pusty. Bez pytania „czy wznowić?" —
 * sesja po prostu trwa (spec §2).
 */
export async function loadActiveWorkout(formula: OneRepMaxFormula): Promise<void> {
  const token = (loadToken += 1);
  const cached = readSnapshot(currentUserId());
  if (cached !== null) {
    setState({ status: "ready", workout: cached.workout });
  } else if (state.workout === null) {
    setState({ status: "loading" });
  }

  // Trwały stan lokalny. Migawka w `localStorage` ginie przy czyszczeniu danych
  // strony i nie ma jej w świeżo otwartej zakładce -- Dexie przeżywa jedno i drugie.
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
      // UWAGA: bez `else` niżej ta gałąź wracała `return`-em i pomijała
      // `requestSync()` na końcu funkcji — czyli w najczęstszym przypadku
      // (brak otwartego treningu) synchronizacja nie startowała wcale.
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
    // Brak sieci: jeśli mamy migawkę albo wiersze w Dexie, ekran działa dalej;
    // jeśli nie — stan pusty z możliwością rozpoczęcia treningu offline.
    setState({ status: state.workout === null ? "empty" : "ready" });
  }

  // Wejście na ekran to dobry moment, żeby dogonić zaległości.
  void requestSync();
}

/**
 * Serwer mówi „brak otwartego treningu" (204). To NIE znaczy automatycznie, że
 * trzeba czyścić ekran: trening rozpoczęty bez zasięgu istnieje tylko lokalnie,
 * więc serwer o nim nie wie i nie ma prawa go skasować. Zwykłe wyczyszczenie
 * stanu w tym miejscu kasowałoby całą sesję z siłowni bez zasięgu.
 *
 * Jeśli więc w Dexie jest otwarty trening, zostawiamy go na ekranie i wypychamy
 * na serwer. Jeśli nie ma — 204 znaczy dokładnie to, co mówi.
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

/** Wejście na dowolny ekran apki: trening ładujemy raz, bo powłoka pokazuje
 * pasek „Trening trwa" także poza `/trening`. */
export function ensureActiveWorkoutLoaded(formula: OneRepMaxFormula): void {
  if (state.status === "idle") {
    void loadActiveWorkout(formula);
  }
}

/** Szablon niesie `targetSets`, których `WorkoutExerciseResponse` nie zawiera —
 * stąd dociągnięcie rutyny, żeby nagłówek karty pokazał `0/3`. */
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
    /* licznik 0/3 to ozdoba, jego brak nie może psuć ekranu */
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
 * Linijka „ostatnio: 100 × 5". Bieżąca sesja jest z historii wycięta — inaczej
 * po odświeżeniu strony referencją stałaby się seria zrobiona pięć minut temu.
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
      // Historia dociera po tym, jak wiersz serii już stoi na ekranie, więc
      // podpowiedź ciężaru wchodzi dopiero TERAZ — i tylko do szkiców, których
      // nikt w międzyczasie nie tknął.
      drafts: suggestWeights(state.drafts, exerciseId, sets),
    });
  } catch {
    setState({
      references: { ...state.references, [exerciseId]: { status: "ready", sets: [] } },
    });
  }
}

/**
 * Wstawia podpowiedź ciężaru do szkiców tego ćwiczenia. Numer serii bierze się
 * z liczby serii już zrobionych w tej sesji — druga seria patrzy na drugą
 * serię poprzedniego treningu, tak samo jak linijka „ostatnio: 100 × 5".
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
 * Start treningu
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
 * Ćwiczenia
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
    // Gdy historia tego ćwiczenia jest już w pamięci (drugie podejście w tej
    // samej sesji), podpowiedź wchodzi od razu, bez czekania na sieć.
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
    // Bez tego wznowiony bez zasięgu trening pokazałby ćwiczenie bez nazwy:
    // `workout_exercises` niesie tylko `exerciseId`.
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
  // Migawka już nie zawiera tego ćwiczenia, więc `persistWorkout` by go nie
  // dotknęło -- tombstone zapisujemy wprost, razem z kaskadą na serie.
  const deletedAt = new Date().toISOString();
  persistTombstone((db) => markWorkoutExerciseDeleted(db, workoutExerciseId, deletedAt));
  submit(
    `exercise-delete:${workoutExerciseId}`,
    `Usunięcie ćwiczenia „${exercise?.exerciseName ?? ""}"`,
    [],
    () => removeWorkoutExercise(workout.id, workoutExerciseId),
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
 * Szkice serii
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

/** Nowy pusty wiersz, opcjonalnie wstępnie wypełniony poprzednią serią. */
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

/** Tap w zatwierdzony wiersz — ten sam `id`, więc ✓ zrobi upsert, nie duplikat. */
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
  /** `exerciseId` z katalogu — potrzebny do czasu przerwy per ćwiczenie. */
  exerciseId: string;
}

/**
 * ✓ Zatwierdź. Zapis + wygaszenie wiersza + kolejny pusty wiersz wstępnie
 * wypełniony tymi samymi wartościami. Timer startuje wołający (komponent zna
 * preferencje przerwy), bo magazyn nie powinien znać ustawień urządzenia.
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

  // Kolejny wiersz od razu gotowy z tymi samymi wartościami: 5×5 to pięć
  // tapnięć w ✓, nie pięć wypełnień formularza. Nie dostaje autofocusu —
  // klawiatura w trakcie przerwy zasłania połowę ekranu.
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
 * Usuwanie serii (soft delete + Cofnij)
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

/** `PUT` tym samym `id` zdejmuje tombstone (sprawdzone na żywym API). */
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
 * Trening jako całość
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
 * Zakończenie czeka na serwer — inaczej podsumowanie musiałoby zgadywać
 * `personalRecordsBrokenIn`, a to jedyna liczba na tym ekranie, której
 * przeglądarka nie potrafi policzyć bez całej historii.
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
    // Bez zasięgu trening i tak trzeba dać zamknąć — to najczęstszy moment
    // całej sesji na siłowni w suterenie. Kończymy lokalnie: `endedAt` ląduje
    // w Dexie z `dirty = 1` i pojedzie synchronizacją.
    //
    // Podsumowanie pokaże wtedy wszystko poza plakietkami rekordów:
    // `personalRecordsBrokenIn` zależy od całej historii ćwiczenia, której
    // przeglądarka nie ma. Zgadywanie ich lokalnie dałoby „PR", który po
    // synchronizacji znika — lepiej pokazać je z opóźnieniem niż fałszywie.
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

/** Ekran wraca do stanu „brak treningu". Sam stan, bez żadnego zapisu. */
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
  // Tombstone lokalnie ZAWSZE, niezależnie od tego, czy żądanie przejdzie.
  // Bez niego porzucony bez zasięgu trening wróciłby na ekran przy pierwszej
  // synchronizacji, bo serwer dalej miałby go za otwarty.
  const deletedAt = new Date().toISOString();
  persistTombstone((db) => markWorkoutDeleted(db, workout.id, deletedAt));
  try {
    await discardWorkout(workout.id);
  } catch {
    // Kasowanie dojedzie paczką sync — tombstone czeka w Dexie.
    void requestSync();
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

/** Sam fakt trwania treningu — primitive, żeby belka nawigacji nie re-renderowała się przy każdej serii. */
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

/** Wyczyszczenie przy wylogowaniu — cudzy trening nie może zostać na urządzeniu. */
export function resetWorkoutStore(): void {
  clearSnapshot();
  state = INITIAL;
  notify();
}
