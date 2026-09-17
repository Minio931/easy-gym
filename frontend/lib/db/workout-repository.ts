import {
  CLEAN,
  DIRTY,
  type EasyGymDatabase,
  type LocalSet,
  type LocalWorkout,
  type LocalWorkoutExercise,
} from "@/lib/db/schema";
import { displayVolumeKg, prEligibleVolumeKg, estimate1RM, type OneRepMaxFormula } from "@/lib/metrics";
import type {
  Equipment,
  ExerciseResponse,
  SetResponse,
  WorkoutDetailResponse,
  WorkoutExerciseResponse,
} from "@/types/api";

/**
 * Most między `WorkoutDetailResponse` (kształt ekranu) a wierszami Dexie
 * (kształt paczki sync). Rozkład w jedną stronę, złożenie w drugą.
 *
 * Złożenie liczy objętości i e1RM przez `lib/metrics.ts` — te same funkcje,
 * których używa łatka optymistyczna i które są mirrorem backendu. Gdyby liczyło
 * je tutaj po swojemu, trening wznowiony bez zasięgu pokazywałby inną objętość
 * niż ten sam trening otwarty online.
 *
 * Czego złożenie **nie** odtwarza: `personalRecordsBrokenIn`. Rekord zależy od
 * całej historii ćwiczenia, której lokalna baza w trakcie sesji nie ma — tak
 * samo jak łatka optymistyczna, plakietka „PR" zapala się z odpowiedzi serwera.
 */

/* ------------------------------------------------------------------ *
 * Zapis
 * ------------------------------------------------------------------ */

/**
 * Zapisuje trening jako wiersze. `dirtyIds` to id-y wierszy, które zmienił
 * user i które mają pojechać na serwer; pozostałe **zachowują swój dotychczasowy
 * znacznik** — nadpisanie go zerem skasowałoby z kolejki serię, która wciąż
 * czeka na wysłanie.
 */
export async function persistWorkout(
  db: EasyGymDatabase,
  workout: WorkoutDetailResponse,
  dirtyIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const workoutRow: Omit<LocalWorkout, "dirty"> = {
    id: workout.id,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    routineId: workout.routineId,
    notes: workout.notes,
    isDeload: workout.isDeload,
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
    deletedAt: null,
  };

  const exerciseRows: Omit<LocalWorkoutExercise, "dirty">[] = workout.exercises.map((exercise) => ({
    id: exercise.id,
    workoutId: workout.id,
    exerciseId: exercise.exerciseId,
    orderIndex: exercise.orderIndex,
    notes: exercise.notes,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
    deletedAt: exercise.deletedAt,
  }));

  const setRows: Omit<LocalSet, "dirty">[] = workout.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      id: set.id,
      workoutExerciseId: exercise.id,
      setIndex: set.setIndex,
      weightKg: set.weightKg,
      reps: set.reps,
      rpe: set.rpe,
      isWarmup: set.isWarmup,
      toFailure: set.toFailure,
      assisted: set.assisted,
      completedAt: set.completedAt,
      updatedAt: set.updatedAt,
      deletedAt: set.deletedAt,
    })),
  );

  await db.transaction("rw", db.workouts, db.workoutExercises, db.sets, async () => {
    await putPreservingDirty(db.workouts, [workoutRow], dirtyIds);
    await putPreservingDirty(db.workoutExercises, exerciseRows, dirtyIds);
    await putPreservingDirty(db.sets, setRows, dirtyIds);
  });
}

interface DirtyAware {
  id: string;
  dirty: 0 | 1;
}

interface PutTable<T extends DirtyAware> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<string>;
}

async function putPreservingDirty<T extends DirtyAware>(
  table: PutTable<T>,
  rows: readonly Omit<T, "dirty">[],
  dirtyIds: ReadonlySet<string>,
): Promise<void> {
  for (const row of rows) {
    const existing = await table.get(row.id);
    const dirty = dirtyIds.has(row.id) ? DIRTY : (existing?.dirty ?? CLEAN);
    await table.put({ ...row, dirty } as T);
  }
}

/**
 * Trening potwierdzony przez serwer: wszystkie jego wiersze są już na serwerze,
 * więc przestają czekać w kolejce. Wierszy, których w odpowiedzi nie ma
 * (tombstone'y skasowanych serii), świadomie nie ruszamy — o nie zadba sync.
 */
export async function persistServerWorkout(
  db: EasyGymDatabase,
  workout: WorkoutDetailResponse,
): Promise<void> {
  await persistWorkout(db, workout, new Set());
  await db.transaction("rw", db.workouts, db.workoutExercises, db.sets, async () => {
    await clearDirty(db.workouts, [workout.id]);
    await clearDirty(
      db.workoutExercises,
      workout.exercises.map((exercise) => exercise.id),
    );
    await clearDirty(
      db.sets,
      workout.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id)),
    );
  });
}

async function clearDirty<T extends DirtyAware>(
  table: PutTable<T>,
  ids: readonly string[],
): Promise<void> {
  for (const id of ids) {
    const row = await table.get(id);
    if (row !== undefined && row.dirty === DIRTY) {
      await table.put({ ...row, dirty: CLEAN } as T);
    }
  }
}

/**
 * Tombstone, nie `DELETE` — skasowanie musi dojechać na drugie urządzenie
 * (PROMPT §2). Kaskada jest jawna, bo Dexie nie zna kluczy obcych.
 */
export async function markWorkoutDeleted(
  db: EasyGymDatabase,
  workoutId: string,
  now: string,
): Promise<void> {
  await db.transaction("rw", db.workouts, db.workoutExercises, db.sets, async () => {
    const workout = await db.workouts.get(workoutId);
    if (workout !== undefined) {
      await db.workouts.put({ ...workout, deletedAt: now, updatedAt: now, dirty: DIRTY });
    }
    const exercises = await db.workoutExercises.where("workoutId").equals(workoutId).toArray();
    for (const exercise of exercises) {
      await db.workoutExercises.put({ ...exercise, deletedAt: now, updatedAt: now, dirty: DIRTY });
      const sets = await db.sets.where("workoutExerciseId").equals(exercise.id).toArray();
      for (const set of sets) {
        await db.sets.put({ ...set, deletedAt: now, updatedAt: now, dirty: DIRTY });
      }
    }
  });
}

export async function markSetDeleted(
  db: EasyGymDatabase,
  setId: string,
  now: string,
): Promise<void> {
  const set = await db.sets.get(setId);
  if (set !== undefined) {
    await db.sets.put({ ...set, deletedAt: now, updatedAt: now, dirty: DIRTY });
  }
}

export async function markWorkoutExerciseDeleted(
  db: EasyGymDatabase,
  workoutExerciseId: string,
  now: string,
): Promise<void> {
  await db.transaction("rw", db.workoutExercises, db.sets, async () => {
    const exercise = await db.workoutExercises.get(workoutExerciseId);
    if (exercise !== undefined) {
      await db.workoutExercises.put({ ...exercise, deletedAt: now, updatedAt: now, dirty: DIRTY });
    }
    const sets = await db.sets.where("workoutExerciseId").equals(workoutExerciseId).toArray();
    for (const set of sets) {
      await db.sets.put({ ...set, deletedAt: now, updatedAt: now, dirty: DIRTY });
    }
  });
}

/** Katalog ćwiczeń z serwera — potrzebny, żeby offline złożyć nazwy w karcie. */
export async function cacheExercises(
  db: EasyGymDatabase,
  exercises: readonly ExerciseResponse[],
): Promise<void> {
  for (const exercise of exercises) {
    const existing = await db.exercises.get(exercise.id);
    if (existing?.dirty === DIRTY) {
      continue;
    }
    await db.exercises.put({
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
}

/* ------------------------------------------------------------------ *
 * Odczyt
 * ------------------------------------------------------------------ */

/** Trening w toku: bez `endedAt`, bez tombstone'u. Najwyżej jeden na konto. */
export async function readActiveWorkout(
  db: EasyGymDatabase,
  formula: OneRepMaxFormula,
): Promise<WorkoutDetailResponse | null> {
  // IndexedDB nie indeksuje `null`, więc wierszy z `endedAt: null` NIE MA w
  // indeksie `endedAt` i żadne `where(...)` ich nie znajdzie -- to cichy błąd,
  // nie wyjątek. Filtrujemy w pamięci; treningów na koncie są setki, nie miliony.
  const open = (await db.workouts.toArray())
    .filter((workout) => workout.endedAt === null && workout.deletedAt === null)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  const workout = open[0];
  return workout === undefined ? null : composeWorkout(db, workout, formula);
}

export async function readWorkout(
  db: EasyGymDatabase,
  workoutId: string,
  formula: OneRepMaxFormula,
): Promise<WorkoutDetailResponse | null> {
  const workout = await db.workouts.get(workoutId);
  if (workout === undefined || workout.deletedAt !== null) {
    return null;
  }
  return composeWorkout(db, workout, formula);
}

async function composeWorkout(
  db: EasyGymDatabase,
  workout: LocalWorkout,
  formula: OneRepMaxFormula,
): Promise<WorkoutDetailResponse> {
  const exerciseRows = (await db.workoutExercises.where("workoutId").equals(workout.id).toArray())
    .filter((row) => row.deletedAt === null)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const exercises: WorkoutExerciseResponse[] = [];
  for (const row of exerciseRows) {
    const catalog = await db.exercises.get(row.exerciseId);
    const sets = (await db.sets.where("workoutExerciseId").equals(row.id).toArray())
      .filter((set) => set.deletedAt === null)
      .sort((a, b) => a.setIndex - b.setIndex)
      .map((set): SetResponse => ({
        id: set.id,
        workoutExerciseId: row.id,
        setIndex: set.setIndex,
        weightKg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe,
        isWarmup: set.isWarmup,
        toFailure: set.toFailure,
        assisted: set.assisted,
        e1rmKg: estimate1RM(set.weightKg, set.reps, formula),
        completedAt: set.completedAt,
        updatedAt: set.updatedAt,
        deletedAt: null,
      }));

    const metricsSets = sets.map(toMetricsSet);
    exercises.push({
      id: row.id,
      workoutId: workout.id,
      exerciseId: row.exerciseId,
      // Ćwiczenia spoza katalogu w tej bazie (dodane na innym urządzeniu i
      // jeszcze nie zaciągnięte) nie mogą wywrócić ekranu — karta pokaże
      // znak zapytania zamiast nazwy i naprawi się przy pierwszej synchronizacji.
      exerciseName: catalog?.name ?? "Ćwiczenie",
      muscleGroup: catalog?.muscleGroup ?? "",
      equipment: (catalog?.equipment ?? "other") as Equipment,
      orderIndex: row.orderIndex,
      notes: row.notes,
      sets,
      displayVolumeKg: displayVolumeKg(metricsSets),
      prEligibleVolumeKg: prEligibleVolumeKg(metricsSets),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: null,
    });
  }

  const allSets = exercises.flatMap((exercise) => exercise.sets.map(toMetricsSet));
  return {
    id: workout.id,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationSeconds:
      workout.endedAt === null
        ? null
        : Math.round((Date.parse(workout.endedAt) - Date.parse(workout.startedAt)) / 1000),
    isDeload: workout.isDeload,
    notes: workout.notes,
    routineId: workout.routineId,
    exercises,
    displayVolumeKg: displayVolumeKg(allSets),
    prEligibleVolumeKg: prEligibleVolumeKg(allSets),
    workingSetCount: allSets.filter((set) => !set.isWarmup).length,
    personalRecordsBrokenIn: [],
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
  };
}

function toMetricsSet(set: SetResponse) {
  return {
    setId: set.id,
    completedAt: set.completedAt,
    weightKg: set.weightKg,
    reps: set.reps,
    isWarmup: set.isWarmup,
    toFailure: set.toFailure,
    assisted: set.assisted,
  };
}
