import {
  computePersonalRecords,
  displayVolumeKg,
  estimate1RM,
  formatIsoDate,
  isoWeekMondayStart,
  isoWeekOfDate,
  isoWeekSundayEnd,
  round2,
  sevenDayRollingAverage,
  warsawCalendarDate,
  weekOverWeekDeltaKg,
  weekOverWeekDeltaPercent,
  weeklyAverages,
  type ExerciseSet,
  type IsoDate,
  type OneRepMaxFormula,
  type WorkoutSession,
} from "@/lib/metrics";
import type {
  BodyWeightSync,
  ExerciseSync,
  SetSync,
  WorkoutExerciseSync,
  WorkoutSync,
} from "@/types/sync";

/**
 * Zestaw danych eksportu — czysta funkcja z surowych rekordów na wiersze
 * arkuszy (PROMPT §7). Dane biorą się z Dexie, bo po pierwszej synchronizacji
 * leży tam KOMPLET historii (`since: null` = pełny zaciąg). Dzięki temu
 * eksport nie wymaga nowego endpointu ani ściągania tysięcy serii „na teraz",
 * i działa bez zasięgu.
 *
 * Każda liczba idzie z `lib/metrics.ts`, czyli z mirrora reguł backendu.
 * Własna arytmetyka w tym pliku oznaczałaby, że plik .xlsx pokazuje inny
 * rekord niż ekran ćwiczenia — a to jest dokładnie ten rodzaj rozjazdu,
 * którego nikt nie zauważy w porę.
 */

export interface ExportSource {
  workouts: readonly WorkoutSync[];
  workoutExercises: readonly WorkoutExerciseSync[];
  sets: readonly SetSync[];
  exercises: readonly ExerciseSync[];
  bodyWeights: readonly BodyWeightSync[];
}

export interface ExportFilters {
  /** `YYYY-MM-DD`; `null` = bez ograniczenia z tej strony. */
  from: IsoDate | null;
  to: IsoDate | null;
  /** `null` = wszystkie ćwiczenia. */
  exerciseIds: readonly string[] | null;
  workingSetsOnly: boolean;
}

export const NO_FILTERS: ExportFilters = {
  from: null,
  to: null,
  exerciseIds: null,
  workingSetsOnly: false,
};

/* ------------------------------------------------------------------ *
 * Wiersze arkuszy
 * ------------------------------------------------------------------ */

export interface SetRow {
  date: IsoDate;
  exerciseName: string;
  muscleGroup: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  volumeKg: number;
  e1rmKg: number | null;
  isWarmup: boolean;
  /** Seria pobiła rekord W MOMENCIE wykonania (nie: jest globalnym maksimum). */
  isPersonalRecord: boolean;
}

export interface WorkoutRow {
  date: IsoDate;
  weekday: string;
  durationSeconds: number | null;
  exerciseNames: string;
  setCount: number;
  volumeKg: number;
  isDeload: boolean;
}

export interface ProgressRow {
  exerciseName: string;
  muscleGroup: string;
  firstDate: IsoDate;
  firstWeightKg: number;
  firstReps: number;
  lastDate: IsoDate;
  lastWeightKg: number;
  lastReps: number;
  bestWeightKg: number;
  bestE1rmKg: number | null;
  gainKg: number;
  gainPercent: number | null;
}

export interface BodyWeightRow {
  date: IsoDate;
  weightKg: number;
  rollingSevenDayKg: number | null;
}

export interface WeeklyWeightRow {
  year: number;
  week: number;
  from: IsoDate;
  to: IsoDate;
  measurementCount: number;
  averageKg: number;
  deltaKg: number | null;
  deltaPercent: number | null;
}

export interface SummaryRecord {
  exerciseName: string;
  category: string;
  value: number;
}

export interface ExportSummary {
  from: IsoDate | null;
  to: IsoDate | null;
  workoutCount: number;
  totalVolumeKg: number;
  workingSetCount: number;
  records: SummaryRecord[];
  bodyWeightStartKg: number | null;
  bodyWeightEndKg: number | null;
  bodyWeightDeltaKg: number | null;
}

export interface ExportDataset {
  summary: ExportSummary;
  workouts: WorkoutRow[];
  sets: SetRow[];
  progress: ProgressRow[];
  bodyWeight: BodyWeightRow[];
  weeklyWeight: WeeklyWeightRow[];
}

const WEEKDAYS = [
  "niedziela",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
];

/* ------------------------------------------------------------------ *
 * Budowa
 * ------------------------------------------------------------------ */

export function buildExportDataset(
  source: ExportSource,
  filters: ExportFilters,
  formula: OneRepMaxFormula,
): ExportDataset {
  const exercises = new Map(
    source.exercises.filter(live).map((exercise) => [exercise.id, exercise]),
  );
  const workouts = source.workouts
    .filter(live)
    .map((workout) => ({ workout, date: warsawCalendarDate(workout.startedAt) }))
    .sort((a, b) => a.workout.startedAt.localeCompare(b.workout.startedAt));

  const setsByWorkoutExercise = groupBy(source.sets.filter(live), (set) => set.workoutExerciseId);
  const workoutExercisesByWorkout = groupBy(
    source.workoutExercises.filter(live),
    (item) => item.workoutId,
  );

  // Rekordy liczymy na PEŁNEJ historii ćwiczenia, nie na przefiltrowanej.
  // Zawężenie zakresu dat nie zmienia tego, czy seria pobiła wtedy rekord —
  // liczenie tego w oknie zrobiłoby „PR" z pierwszej serii każdego eksportu.
  const prSetIds = personalRecordSetIds(
    workouts,
    workoutExercisesByWorkout,
    setsByWorkoutExercise,
    formula,
  );

  const setRows: SetRow[] = [];
  const workoutRows: WorkoutRow[] = [];
  const perExercise = new Map<string, { exercise: ExerciseSync; rows: SetRow[] }>();

  for (const { workout, date } of workouts) {
    if (!inRange(date, filters)) {
      continue;
    }

    const items = (workoutExercisesByWorkout.get(workout.id) ?? []).sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    const namesInWorkout: string[] = [];
    let workoutSets: SetSync[] = [];

    for (const item of items) {
      const exercise = exercises.get(item.exerciseId);
      if (exercise === undefined) {
        continue;
      }
      if (filters.exerciseIds !== null && !filters.exerciseIds.includes(item.exerciseId)) {
        continue;
      }
      namesInWorkout.push(exercise.name);

      const sets = (setsByWorkoutExercise.get(item.id) ?? [])
        .filter((set) => !(filters.workingSetsOnly && set.isWarmup))
        .sort((a, b) => a.setIndex - b.setIndex);
      workoutSets = [...workoutSets, ...sets];

      for (const set of sets) {
        const row: SetRow = {
          date,
          exerciseName: exercise.name,
          muscleGroup: exercise.muscleGroup,
          setIndex: set.setIndex + 1,
          weightKg: round2(set.weightKg),
          reps: set.reps,
          rpe: set.rpe,
          // Objętość serii liczona tą samą funkcją co wszędzie indziej;
          // rozgrzewka ma objętość 0, bo nie wchodzi do objętości sesji.
          volumeKg: displayVolumeKg([toExerciseSet(set)]),
          e1rmKg: set.isWarmup ? null : estimate1RM(set.weightKg, set.reps, formula),
          isWarmup: set.isWarmup,
          isPersonalRecord: prSetIds.has(set.id),
        };
        setRows.push(row);

        const bucket = perExercise.get(exercise.id);
        if (bucket === undefined) {
          perExercise.set(exercise.id, { exercise, rows: [row] });
        } else {
          bucket.rows.push(row);
        }
      }
    }

    if (namesInWorkout.length === 0) {
      continue;
    }

    workoutRows.push({
      date,
      weekday: WEEKDAYS[new Date(workout.startedAt).getDay()],
      durationSeconds:
        workout.endedAt === null
          ? null
          : Math.max(
              0,
              Math.round(
                (new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 1000,
              ),
            ),
      exerciseNames: namesInWorkout.join(", "),
      setCount: workoutSets.filter((set) => !set.isWarmup).length,
      volumeKg: displayVolumeKg(workoutSets.map(toExerciseSet)),
      isDeload: workout.isDeload,
    });
  }

  const bodyWeight = buildBodyWeight(source.bodyWeights, filters);

  return {
    summary: buildSummary(filters, workoutRows, setRows, perExercise, bodyWeight),
    workouts: workoutRows,
    sets: setRows,
    progress: buildProgress(perExercise),
    bodyWeight,
    weeklyWeight: buildWeeklyWeight(source.bodyWeights, filters),
  };
}

/* ------------------------------------------------------------------ *
 * Rekordy
 * ------------------------------------------------------------------ */

function personalRecordSetIds(
  workouts: readonly { workout: WorkoutSync; date: IsoDate }[],
  workoutExercisesByWorkout: Map<string, WorkoutExerciseSync[]>,
  setsByWorkoutExercise: Map<string, SetSync[]>,
  formula: OneRepMaxFormula,
): Set<string> {
  const sessionsByExercise = new Map<string, WorkoutSession[]>();

  for (const { workout } of workouts) {
    for (const item of workoutExercisesByWorkout.get(workout.id) ?? []) {
      const sets = (setsByWorkoutExercise.get(item.id) ?? []).sort(
        (a, b) => a.setIndex - b.setIndex,
      );
      if (sets.length === 0) {
        continue;
      }
      const sessions = sessionsByExercise.get(item.exerciseId) ?? [];
      sessions.push({ workoutId: workout.id, sets: sets.map(toExerciseSet) });
      sessionsByExercise.set(item.exerciseId, sessions);
    }
  }

  const ids = new Set<string>();
  for (const sessions of sessionsByExercise.values()) {
    // Rekord „w momencie wykonania": przechodzimy historię narastająco i po
    // każdej sesji patrzymy, czy rekord przeskoczył na jej serię. Ten sam
    // algorytm co `personalRecordsBrokenIn`, tylko dla każdej sesji po kolei.
    let previous = new Set<string>();
    for (let index = 1; index <= sessions.length; index += 1) {
      const records = computePersonalRecords(sessions.slice(0, index), formula);
      const current = new Set(
        [records.maxWeight, records.maxE1rm, ...Object.values(records.byRepRange)]
          .filter((entry) => entry !== null)
          .map((entry) => entry.setId),
      );
      const sessionSetIds = new Set(sessions[index - 1].sets.map((set) => set.setId));
      for (const setId of current) {
        if (!previous.has(setId) && sessionSetIds.has(setId)) {
          ids.add(setId);
        }
      }
      previous = current;
    }
  }
  return ids;
}

/* ------------------------------------------------------------------ *
 * Arkusze pochodne
 * ------------------------------------------------------------------ */

function buildProgress(
  perExercise: Map<string, { exercise: ExerciseSync; rows: SetRow[] }>,
): ProgressRow[] {
  const progress: ProgressRow[] = [];

  for (const { exercise, rows } of perExercise.values()) {
    // Progres liczymy na seriach ROBOCZYCH: rozgrzewka rośnie razem z formą,
    // ale „przyrost" z rozgrzewki to nie jest przyrost siły.
    const working = rows.filter((row) => !row.isWarmup);
    if (working.length === 0) {
      continue;
    }
    const days = [...new Set(working.map((row) => row.date))].sort();
    const first = heaviestRow(working.filter((row) => row.date === days[0]));
    const last = heaviestRow(working.filter((row) => row.date === days[days.length - 1]));
    if (first === null || last === null) {
      continue;
    }

    const bestWeight = Math.max(...working.map((row) => row.weightKg));
    const e1rms = working
      .map((row) => row.e1rmKg)
      .filter((value): value is number => value !== null);

    progress.push({
      exerciseName: exercise.name,
      muscleGroup: exercise.muscleGroup,
      firstDate: first.date,
      firstWeightKg: first.weightKg,
      firstReps: first.reps,
      lastDate: last.date,
      lastWeightKg: last.weightKg,
      lastReps: last.reps,
      bestWeightKg: round2(bestWeight),
      bestE1rmKg: e1rms.length === 0 ? null : round2(Math.max(...e1rms)),
      gainKg: round2(last.weightKg - first.weightKg),
      // Jedna sesja = brak przyrostu, nie „0%". Zero sugerowałoby, że coś
      // porównano i wyszło bez zmian.
      gainPercent:
        days.length < 2 || first.weightKg === 0
          ? null
          : round2(((last.weightKg - first.weightKg) / first.weightKg) * 100),
    });
  }

  return progress.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName, "pl"));
}

function heaviestRow(rows: readonly SetRow[]): SetRow | null {
  return rows.reduce<SetRow | null>(
    (best, row) => (best === null || row.weightKg > best.weightKg ? row : best),
    null,
  );
}

function buildBodyWeight(
  entries: readonly BodyWeightSync[],
  filters: ExportFilters,
): BodyWeightRow[] {
  const live = entries.filter((entry) => entry.deletedAt === null);
  // Krocząca 7-dniowa liczona na PEŁNEJ serii: okno sięga sześć dni wstecz,
  // więc obcięcie danych przed liczeniem zafałszowałoby pierwsze wiersze.
  const rolling = sevenDayRollingAverage(
    live.map((entry) => ({ measuredOn: entry.measuredOn, weightKg: entry.weightKg })),
  );

  return live
    .filter((entry) => inRange(entry.measuredOn, filters))
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map((entry) => ({
      date: entry.measuredOn,
      weightKg: round2(entry.weightKg),
      rollingSevenDayKg: rolling.get(entry.measuredOn) ?? null,
    }));
}

function buildWeeklyWeight(
  entries: readonly BodyWeightSync[],
  filters: ExportFilters,
): WeeklyWeightRow[] {
  const live = entries
    .filter((entry) => entry.deletedAt === null)
    .map((entry) => ({ measuredOn: entry.measuredOn, weightKg: entry.weightKg }));
  // Delty liczymy na pełnym łańcuchu tygodni, a filtr stosujemy dopiero na
  // wyniku — inaczej pierwszy tydzień zakresu zawsze miałby deltę pustą.
  const weeks = weeklyAverages(live);

  return weeks
    .map((week) => ({
      year: week.week.year,
      week: week.week.week,
      from: isoWeekMondayStart(week.week),
      to: isoWeekSundayEnd(week.week),
      measurementCount: week.measurementCount,
      averageKg: week.averageKg,
      deltaKg: weekOverWeekDeltaKg(weeks, week.week),
      deltaPercent: weekOverWeekDeltaPercent(weeks, week.week),
    }))
    .filter((row) => inRange(row.to, filters) || inRange(row.from, filters));
}

function buildSummary(
  filters: ExportFilters,
  workouts: readonly WorkoutRow[],
  sets: readonly SetRow[],
  perExercise: Map<string, { exercise: ExerciseSync; rows: SetRow[] }>,
  bodyWeight: readonly BodyWeightRow[],
): ExportSummary {
  const records: SummaryRecord[] = [];
  for (const { exercise, rows } of perExercise.values()) {
    const working = rows.filter((row) => !row.isWarmup);
    if (working.length === 0) {
      continue;
    }
    const bestWeight = Math.max(...working.map((row) => row.weightKg));
    const e1rms = working
      .map((row) => row.e1rmKg)
      .filter((value): value is number => value !== null);
    records.push({ exerciseName: exercise.name, category: "Najwyższy ciężar", value: bestWeight });
    if (e1rms.length > 0) {
      records.push({
        exerciseName: exercise.name,
        category: "Najwyższy e1RM",
        value: round2(Math.max(...e1rms)),
      });
    }
  }
  const first = bodyWeight[0]?.weightKg ?? null;
  const last = bodyWeight[bodyWeight.length - 1]?.weightKg ?? null;

  return {
    from: filters.from,
    to: filters.to,
    workoutCount: workouts.length,
    totalVolumeKg: round2(workouts.reduce((sum, workout) => sum + workout.volumeKg, 0)),
    workingSetCount: sets.filter((row) => !row.isWarmup).length,
    records: records.sort(
      (a, b) =>
        a.exerciseName.localeCompare(b.exerciseName, "pl") || a.category.localeCompare(b.category),
    ),
    bodyWeightStartKg: first,
    bodyWeightEndKg: last,
    bodyWeightDeltaKg: first === null || last === null ? null : round2(last - first),
  };
}

/* ------------------------------------------------------------------ *
 * Drobiazgi
 * ------------------------------------------------------------------ */

function live<T extends { deletedAt: string | null }>(record: T): boolean {
  return record.deletedAt === null;
}

function inRange(date: IsoDate, filters: ExportFilters): boolean {
  if (filters.from !== null && date < filters.from) {
    return false;
  }
  return !(filters.to !== null && date > filters.to);
}

function toExerciseSet(set: SetSync): ExerciseSet {
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

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(key(item));
    if (bucket === undefined) {
      map.set(key(item), [item]);
    } else {
      bucket.push(item);
    }
  }
  return map;
}

/** Nazwa pliku: `easy-gym-2026-09-17.xlsx` albo z zakresem, gdy filtr go zawęża. */
export function exportFileName(filters: ExportFilters, today: Date): string {
  const stamp = formatIsoDate(today);
  if (filters.from === null && filters.to === null) {
    return `easy-gym-${stamp}.xlsx`;
  }
  return `easy-gym-${filters.from ?? "poczatek"}_${filters.to ?? stamp}.xlsx`;
}

/** Tydzień ISO dnia — używane przy podpisach zakresu w arkuszu podsumowania. */
export function isoWeekLabel(date: IsoDate): string {
  const week = isoWeekOfDate(date);
  return `${String(week.week)}/${String(week.year)}`;
}

