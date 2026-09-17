/**
 * Kontrakt z backendem (Spring Boot, ../backend). Kształt tych typów jest
 * ustalony po stronie serwera -- zmiana któregokolwiek pola jest zmianą
 * kontraktu, nie refaktorem po stronie frontu (PROMPT.md §12).
 */

/** POST /api/auth/login */
export interface LoginRequest {
  login: string;
  password: string;
}

/** POST /api/auth/refresh */
export interface RefreshRequest {
  refreshToken: string;
}

/** POST /api/auth/logout */
export interface LogoutRequest {
  refreshToken: string;
}

/** 200 z /api/auth/login i /api/auth/refresh. Refresh token jest ROTOWANY. */
export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

/** GET /api/me */
export interface MeResponse {
  userId: string;
  login: string;
}

/** Backend zawsze zwraca błąd jako JSON {"error": "..."}. */
export interface ApiErrorBody {
  error: string;
}

/* ================================================================== *
 * Ćwiczenia
 * ================================================================== */

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "other";

export const EQUIPMENT_VALUES: readonly Equipment[] = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "other",
];

/** GET /api/exercises, GET /api/exercises/{id}, POST /api/exercises */
export interface ExerciseResponse {
  id: string;
  /** `null` = ćwiczenie globalne z seeda, tylko do odczytu. */
  userId: string | null;
  name: string;
  muscleGroup: string;
  equipment: Equipment;
  isArchived: boolean;
  /** To samo co `userId === null`; serwer liczy to za nas. */
  global: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** POST /api/exercises — `id` generuje klient (wymóg sync). */
export interface CreateExerciseRequest {
  id?: string;
  name: string;
  muscleGroup: string;
  equipment: Equipment;
  isArchived?: boolean;
}

/* ================================================================== *
 * Serie i treningi
 * ================================================================== */

export interface SetResponse {
  id: string;
  workoutExerciseId: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  toFailure: boolean;
  assisted: boolean;
  /** Liczone na żywo z `?formula=`; `null` dla Brzyckiego powyżej 36 powtórzeń. */
  e1rmKg: number | null;
  completedAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** PUT .../sets/{setId} jest upsertem — bezpieczny retry przy tym samym `id`. */
export interface SaveSetRequest {
  id?: string;
  setIndex: number;
  /** 0–500, CHECK w bazie. */
  weightKg: number;
  /** 1–100, CHECK w bazie. */
  reps: number;
  /** 1–10 albo `null`. */
  rpe?: number | null;
  isWarmup?: boolean;
  toFailure?: boolean;
  assisted?: boolean;
  completedAt?: string;
}

export interface WorkoutExerciseResponse {
  id: string;
  workoutId: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  equipment: Equipment;
  orderIndex: number;
  notes: string | null;
  sets: SetResponse[];
  /** Serie robocze, `assisted` WLICZONE. */
  displayVolumeKg: number;
  /** Serie robocze, `assisted` WYKLUCZONE. */
  prEligibleVolumeKg: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AddWorkoutExerciseRequest {
  id?: string;
  exerciseId: string;
  orderIndex: number;
  notes?: string | null;
}

export type PersonalRecordCategory =
  | "WEIGHT"
  | "E1RM"
  | "SESSION_VOLUME"
  | "REP_RANGE";

export type RepRangeKey =
  | "ONE"
  | "TWO_TO_THREE"
  | "FOUR_TO_SIX"
  | "SEVEN_TO_TEN"
  | "ELEVEN_TO_FIFTEEN"
  | "FIFTEEN_PLUS";

/** Rekord pobity W MOMENCIE tej sesji, nie globalne maksimum. Remis się nie liczy. */
export interface PersonalRecordBrokenResponse {
  exerciseId: string;
  exerciseName: string;
  category: PersonalRecordCategory;
  /** Wypełnione wyłącznie dla `category: "REP_RANGE"`. */
  repRange: RepRangeKey | null;
  value: number;
  /** `null` dla `SESSION_VOLUME` — rekord należy do sesji, nie do serii. */
  setId: string | null;
  workoutId: string;
}

/**
 * GET /api/workouts/{id}, GET /api/workouts/active oraz **każda** operacja na
 * ćwiczeniach i seriach treningu. Serwer oddaje cały trening, więc front
 * nigdy nie doskleja stanu ręcznie.
 */
export interface WorkoutDetailResponse {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  isDeload: boolean;
  notes: string | null;
  routineId: string | null;
  exercises: WorkoutExerciseResponse[];
  displayVolumeKg: number;
  prEligibleVolumeKg: number;
  workingSetCount: number;
  personalRecordsBrokenIn: PersonalRecordBrokenResponse[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Wiersz listy `GET /api/workouts`. Podsumowanie liczy baza (`GROUP BY`), nie
 * front pętlą po seriach — stąd tu są gotowe liczby, a nie zagnieżdżone serie
 * (PROMPT §9).
 */
export interface WorkoutSummaryResponse {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  isDeload: boolean;
  notes: string | null;
  routineId: string | null;
  exerciseCount: number;
  setCount: number;
  /** Objętość serii roboczych, `assisted` WLICZONE (jak `displayVolumeKg`). */
  volumeKg: number;
}

/** GET /api/workouts — strona listy z licznikiem całości do paginacji. */
export interface WorkoutListResponse {
  items: WorkoutSummaryResponse[];
  total: number;
  limit: number;
  offset: number;
}

/** POST /api/workouts — `id` i `startedAt` pochodzą z klienta. */
export interface CreateWorkoutRequest {
  id?: string;
  startedAt: string;
  endedAt?: string | null;
  routineId?: string | null;
  notes?: string | null;
  isDeload?: boolean;
  /** `true` = serwer tworzy `workout_exercises` z pozycji szablonu. */
  applyRoutine?: boolean;
}

/** PUT /api/workouts/{id} — `endedAt: null` oznacza "trening trwa". */
export interface UpdateWorkoutRequest {
  startedAt?: string;
  endedAt?: string | null;
  notes?: string | null;
  isDeload?: boolean;
}

/* ================================================================== *
 * Szablony treningów
 * ================================================================== */

export interface RoutineItemResponse {
  id: string;
  routineId: string;
  exerciseId: string;
  orderIndex: number;
  targetSets: number | null;
  targetReps: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RoutineResponse {
  id: string;
  name: string;
  notes: string | null;
  items: RoutineItemResponse[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/* ================================================================== *
 * Waga ciała
 * ================================================================== */

/** Jeden ŻYWY wpis na dzień — kluczem biznesowym jest `measuredOn`, nie `id`. */
export interface BodyWeightResponse {
  id: string;
  /** Dzień jako `YYYY-MM-DD`. */
  measuredOn: string;
  weightKg: number;
  note: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

/** PUT /api/body-weights — **upsert po dacie**, nie po `id`. */
export interface SaveBodyWeightRequest {
  id?: string;
  measuredOn: string;
  /** Ostro między 0 a 400 — lustro CHECK-a w bazie. */
  weightKg: number;
  note?: string | null;
}

/**
 * Tydzień ISO-8601 (pon–niedz, `Europe/Warsaw`) — ten sam podział co
 * `IsoWeek` w `lib/metrics.ts` i po stronie serwera.
 */
export interface WeeklyBodyWeightResponse {
  year: number;
  week: number;
  /** Poniedziałek i niedziela tygodnia, `YYYY-MM-DD`. */
  from: string;
  to: string;
  measurementCount: number;
  averageKg: number;
  /** Mniej niż 2 pomiary — pokazujemy, ale wyróżniamy wizualnie (DESIGN §10). */
  incomplete: boolean;
  /** Względem poprzedniego tygodnia z danymi; `null` gdy nie ma z czym porównać. */
  deltaKg: number | null;
  deltaPercent: number | null;
}

export interface RollingAveragePoint {
  date: string;
  averageKg: number;
}

/** Średnia ostatniego tygodnia vs średnia sprzed czterech tygodni z danymi. */
export interface BodyWeightTrendResponse {
  fromYear: number;
  fromWeek: number;
  toYear: number;
  toWeek: number;
  fromAverageKg: number;
  toAverageKg: number;
  deltaKg: number;
  deltaPercent: number;
}

/** GET /api/body-weights/stats — komplet danych ekranu wagi. */
export interface BodyWeightStatsResponse {
  entries: BodyWeightResponse[];
  weekly: WeeklyBodyWeightResponse[];
  rollingSevenDay: RollingAveragePoint[];
  latest: BodyWeightResponse | null;
  fourWeekTrend: BodyWeightTrendResponse | null;
}

/* ================================================================== *
 * Historia ćwiczenia (ekran ćwiczenia; tutaj używana do linijki "ostatnio:")
 * ================================================================== */

export interface ExerciseHistorySessionResponse {
  workoutId: string;
  startedAt: string;
  isDeload: boolean;
  sets: SetResponse[];
  displayVolumeKg: number;
  prEligibleVolumeKg: number;
  heaviestSet: SetResponse | null;
  bestE1rmKg: number | null;
}

export interface PersonalRecordEntryResponse {
  setId: string;
  value: number;
}

export interface SessionVolumeRecordResponse {
  workoutId: string;
  value: number;
}

export interface PersonalRecordsResponse {
  maxWeight: PersonalRecordEntryResponse | null;
  maxE1rm: PersonalRecordEntryResponse | null;
  maxSessionVolume: SessionVolumeRecordResponse | null;
  byRepRange: Partial<Record<RepRangeKey, PersonalRecordEntryResponse>>;
}

/** GET /api/exercises/{id}/history — sesje chronologicznie, najstarsza pierwsza. */
export interface ExerciseHistoryResponse {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  equipment: Equipment;
  sessions: ExerciseHistorySessionResponse[];
  personalRecords: PersonalRecordsResponse;
}
