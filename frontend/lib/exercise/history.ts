import type { ExerciseHistoryResponse, ExerciseHistorySessionResponse } from "@/types/api";

/**
 * Zamiana odpowiedzi `GET /api/exercises/{id}/history` na punkty wykresów.
 * Czyste funkcje — komponenty wykresów dostają gotowe liczby i tylko rysują.
 *
 * Wspólna zasada: **sesja bez danej wartości nie daje punktu**, zamiast dawać
 * zero. Trening złożony z samych rozgrzewek ma `heaviestSet: null` i zero na
 * wykresie ciężaru wyglądałoby jak załamanie formy, którego nie było.
 */

/** `t` to milisekundy — oś X jest liczbowa, żeby odstępy między sesjami były
 *  proporcjonalne do przerw. Oś kategorialna rysuje miesiąc przerwy tak samo
 *  jak dzień i kłamie o tempie progresu. */
interface ChartPointBase {
  t: number;
  workoutId: string;
  startedAt: string;
  isDeload: boolean;
}

export interface WeightPoint extends ChartPointBase {
  weightKg: number;
  reps: number;
  rpe: number | null;
}

export interface E1rmPoint extends ChartPointBase {
  e1rmKg: number;
}

export interface VolumePoint extends ChartPointBase {
  volumeKg: number;
}

function base(session: ExerciseHistorySessionResponse): ChartPointBase {
  return {
    t: Date.parse(session.startedAt),
    workoutId: session.workoutId,
    startedAt: session.startedAt,
    isDeload: session.isDeload,
  };
}

/**
 * Główny wykres: ciężar najcięższej serii roboczej w czasie (DESIGN §10).
 * `heaviestSet` liczy serwer i **wyklucza rozgrzewki** — nie powtarzamy tej
 * reguły tutaj, żeby nie mogła się rozjechać z backendem.
 */
export function weightProgressPoints(
  sessions: readonly ExerciseHistorySessionResponse[],
): WeightPoint[] {
  const points: WeightPoint[] = [];
  for (const session of sessions) {
    const set = session.heaviestSet;
    if (set === null) {
      continue;
    }
    points.push({ ...base(session), weightKg: set.weightKg, reps: set.reps, rpe: set.rpe });
  }
  return points;
}

/** e1RM w czasie. `null` (Brzycki powyżej 36 powtórzeń) pomijamy, nie zerujemy. */
export function e1rmPoints(sessions: readonly ExerciseHistorySessionResponse[]): E1rmPoint[] {
  const points: E1rmPoint[] = [];
  for (const session of sessions) {
    if (session.bestE1rmKg === null) {
      continue;
    }
    points.push({ ...base(session), e1rmKg: session.bestE1rmKg });
  }
  return points;
}

/**
 * Objętość na sesję. Bierzemy `displayVolumeKg` (z `assisted`), bo to jest
 * liczba „ile pracy wykonałem", a nie liczba do trackingu rekordów — ta druga
 * (`prEligibleVolumeKg`) należy do PR-ów i tam zostaje.
 *
 * Tu zero JEST prawdziwą wartością: sesja z samymi rozgrzewkami ma zerową
 * objętość roboczą i tak wygląda w rzeczywistości.
 */
export function volumePoints(
  sessions: readonly ExerciseHistorySessionResponse[],
): VolumePoint[] {
  return sessions.map((session) => ({ ...base(session), volumeKg: session.displayVolumeKg }));
}

/** Zakres powtórzeń w zbiorze punktów — do skalowania wielkości punktu. */
export function repsExtent(points: readonly WeightPoint[]): { min: number; max: number } {
  if (points.length === 0) {
    return { min: 1, max: 1 };
  }
  let min = points[0].reps;
  let max = points[0].reps;
  for (const point of points) {
    min = Math.min(min, point.reps);
    max = Math.max(max, point.reps);
  }
  return { min, max };
}

/**
 * Nagłówek ekranu: ostatnia wartość każdej serii, do pokazania w kafelku.
 * `null` gdy w wybranym zakresie nie ma ani jednego punktu — kafelek pokaże
 * wtedy stan pusty zamiast myślnika udającego liczbę.
 */
export function latestValue<T>(points: readonly T[], value: (point: T) => number): number | null {
  const last = points.at(-1);
  return last === undefined ? null : value(last);
}

/** Czy ćwiczenie ma jakikolwiek ślad w historii (do stanu pustego ekranu). */
export function hasAnyHistory(history: ExerciseHistoryResponse): boolean {
  return history.sessions.length > 0;
}
