import type { APIRequestContext } from "@playwright/test";

/**
 * Wołania REST bezpośrednio do backendu, z pominięciem UI -- do przygotowania
 * i sprzątania stanu w testach (np. "trening już trwa" dla scenariusza
 * wznowienia, albo gwarancja czystego stanu przed testem startu treningu).
 * Kontrakt: `backend/API.md`.
 */
export const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8081";

export const USER_A = {
  login: process.env.E2E_USER_A_LOGIN ?? "Minio",
  password: process.env.E2E_USER_A_PASSWORD ?? "12345678",
};

export const USER_B = {
  login: process.env.E2E_USER_B_LOGIN ?? "Wojtur",
  password: process.env.E2E_USER_B_PASSWORD ?? "12345678",
};

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function apiLogin(
  request: APIRequestContext,
  login: string,
  password: string,
): Promise<TokenPair> {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: { login, password } });
  if (!res.ok()) {
    throw new Error(`Logowanie API dla "${login}" nie powiodło się: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as TokenPair;
}

export interface ActiveWorkout {
  id: string;
  startedAt: string;
  endedAt: string | null;
  [key: string]: unknown;
}

export async function getActiveWorkout(
  request: APIRequestContext,
  accessToken: string,
): Promise<ActiveWorkout | null> {
  const res = await request.get(`${API_URL}/api/workouts/active`, { headers: authHeaders(accessToken) });
  if (res.status() === 204) {
    return null;
  }
  if (!res.ok()) {
    throw new Error(`GET /api/workouts/active: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as ActiveWorkout;
}

export async function deleteWorkout(
  request: APIRequestContext,
  accessToken: string,
  workoutId: string,
): Promise<void> {
  const res = await request.delete(`${API_URL}/api/workouts/${workoutId}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`DELETE /api/workouts/${workoutId}: ${res.status()} ${await res.text()}`);
  }
}

/**
 * Sprząta ewentualny aktywny trening usera przed/po teście, żeby każdy test
 * startuje z gwarantowanie czystego stanu (`GET /api/workouts/active` -> 204).
 * Usunięcie jest miękkie (tombstone, `backend/API.md`) -- nic nie ginie
 * naprawdę, tylko znika z odczytów "na żywo".
 */
export async function ensureNoActiveWorkout(request: APIRequestContext, accessToken: string): Promise<void> {
  const active = await getActiveWorkout(request, accessToken);
  if (active !== null) {
    await deleteWorkout(request, accessToken, active.id);
  }
}

export interface StartedWorkout {
  id: string;
  [key: string]: unknown;
}

/** Startuje trening przez API (bez UI) -- do testów, którym zależy na stanie
 * "trening już trwa" (np. wznowienie po odświeżeniu), nie na samym starcie. */
export async function startWorkoutViaApi(
  request: APIRequestContext,
  accessToken: string,
): Promise<StartedWorkout> {
  const res = await request.post(`${API_URL}/api/workouts`, {
    headers: authHeaders(accessToken),
    data: { id: crypto.randomUUID(), startedAt: new Date().toISOString() },
  });
  if (!res.ok()) {
    throw new Error(`POST /api/workouts: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as StartedWorkout;
}

export interface ExerciseSummary {
  id: string;
  name: string;
}

/** Znajduje id realnego ćwiczenia z katalogu (globalny seed 60 pozycji) po
 * fragmencie nazwy -- zamiast zaszywać w testach konkretne UUID-y seeda. */
export async function findExerciseId(
  request: APIRequestContext,
  accessToken: string,
  query: string,
): Promise<ExerciseSummary> {
  const res = await request.get(`${API_URL}/api/exercises?query=${encodeURIComponent(query)}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok()) {
    throw new Error(`GET /api/exercises?query=${query}: ${res.status()} ${await res.text()}`);
  }
  const items = (await res.json()) as ExerciseSummary[];
  if (items.length === 0) {
    throw new Error(`Brak ćwiczenia pasującego do "${query}" w katalogu -- zaktualizuj helper testowy`);
  }
  return items[0];
}

/** Dodaje ćwiczenie do treningu przez API -- do scenariuszy, które testują
 * coś innego niż samą wyszukiwarkę ćwiczeń (np. wznowienie sesji).
 *
 * `backend/API.md`: "Wszystkie operacje na ćwiczeniach i seriach treningu
 * zwracają CAŁY trening" -- odpowiedź to `WorkoutDetailResponse`, NIE sam
 * dodany `workout_exercise`. Zwracamy więc wprost jego `id` (workoutExerciseId),
 * wyłuskany z `exercises`, żeby wołający nie musiał znać tego kształtu. */
export async function addExerciseToWorkout(
  request: APIRequestContext,
  accessToken: string,
  workoutId: string,
  exerciseId: string,
): Promise<{ id: string; exerciseId: string; [key: string]: unknown }> {
  const res = await request.post(`${API_URL}/api/workouts/${workoutId}/exercises`, {
    headers: authHeaders(accessToken),
    data: { exerciseId, orderIndex: 0 },
  });
  if (!res.ok()) {
    throw new Error(`POST /api/workouts/${workoutId}/exercises: ${res.status()} ${await res.text()}`);
  }
  const workout = (await res.json()) as {
    exercises: Array<{ id: string; exerciseId: string; [key: string]: unknown }>;
  };
  const added = [...workout.exercises].reverse().find((we) => we.exerciseId === exerciseId);
  if (added === undefined) {
    throw new Error(`Dodane ćwiczenie ${exerciseId} nie pojawiło się w odpowiedzi POST .../exercises`);
  }
  return added;
}

/** Dodaje serię przez API -- do scenariuszy, którym zależy na "trening z
 * gotowymi danymi", nie na samym wpisywaniu serii (np. regresja podsumowania). */
export async function addSetToWorkout(
  request: APIRequestContext,
  accessToken: string,
  workoutId: string,
  workoutExerciseId: string,
  set: { weightKg: number; reps: number; setIndex?: number; rpe?: number | null },
): Promise<unknown> {
  const res = await request.post(
    `${API_URL}/api/workouts/${workoutId}/exercises/${workoutExerciseId}/sets`,
    {
      headers: authHeaders(accessToken),
      data: { setIndex: set.setIndex ?? 0, weightKg: set.weightKg, reps: set.reps, rpe: set.rpe ?? null },
    },
  );
  if (!res.ok()) {
    throw new Error(`POST .../sets: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

/** Kończy trening przez API (`POST /api/workouts/{id}/finish`). */
export async function finishWorkoutViaApi(
  request: APIRequestContext,
  accessToken: string,
  workoutId: string,
): Promise<unknown> {
  const res = await request.post(`${API_URL}/api/workouts/${workoutId}/finish`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok()) {
    throw new Error(`POST /api/workouts/${workoutId}/finish: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}
