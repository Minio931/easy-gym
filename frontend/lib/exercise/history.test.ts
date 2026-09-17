import { describe, expect, it } from "vitest";
import {
  e1rmPoints,
  latestValue,
  repsExtent,
  volumePoints,
  weightProgressPoints,
} from "@/lib/exercise/history";
import type { ExerciseHistorySessionResponse, SetResponse } from "@/types/api";

function set(overrides: Partial<SetResponse> = {}): SetResponse {
  return {
    id: "s1",
    workoutExerciseId: "we1",
    setIndex: 0,
    weightKg: 100,
    reps: 5,
    rpe: null,
    isWarmup: false,
    toFailure: false,
    assisted: false,
    e1rmKg: 116.67,
    completedAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

function session(
  overrides: Partial<ExerciseHistorySessionResponse> = {},
): ExerciseHistorySessionResponse {
  return {
    workoutId: "w1",
    startedAt: "2026-09-01T10:00:00Z",
    isDeload: false,
    sets: [set()],
    displayVolumeKg: 500,
    prEligibleVolumeKg: 500,
    heaviestSet: set(),
    bestE1rmKg: 116.67,
    ...overrides,
  };
}

describe("weightProgressPoints", () => {
  it("pomija sesję bez serii roboczej zamiast rysować zero", () => {
    // Trening złożony z samych rozgrzewek ma heaviestSet: null. Zero na
    // wykresie ciężaru wyglądałoby jak załamanie formy, którego nie było.
    const points = weightProgressPoints([
      session({ workoutId: "w1" }),
      session({ workoutId: "w2", heaviestSet: null }),
      session({ workoutId: "w3", heaviestSet: set({ weightKg: 105, reps: 3 }) }),
    ]);
    expect(points.map((p) => p.workoutId)).toEqual(["w1", "w3"]);
    expect(points[1].weightKg).toBe(105);
    expect(points[1].reps).toBe(3);
  });

  it("niesie RPE i deload, bo tooltip i wykres ich potrzebują", () => {
    const points = weightProgressPoints([
      session({ isDeload: true, heaviestSet: set({ rpe: 8 }) }),
    ]);
    expect(points[0].rpe).toBe(8);
    expect(points[0].isDeload).toBe(true);
  });

  it("oś X jest liczbowa (ms), żeby przerwy między sesjami były proporcjonalne", () => {
    const points = weightProgressPoints([session({ startedAt: "2026-09-01T10:00:00Z" })]);
    expect(points[0].t).toBe(Date.parse("2026-09-01T10:00:00Z"));
  });
});

describe("e1rmPoints", () => {
  it("pomija sesje bez e1RM (Brzycki powyżej 36 powtórzeń) zamiast zerować", () => {
    const points = e1rmPoints([
      session({ workoutId: "w1" }),
      session({ workoutId: "w2", bestE1rmKg: null }),
    ]);
    expect(points.map((p) => p.workoutId)).toEqual(["w1"]);
  });
});

describe("volumePoints", () => {
  it("bierze displayVolumeKg -- objętość pokazywana userowi wlicza assisted", () => {
    const points = volumePoints([session({ displayVolumeKg: 800, prEligibleVolumeKg: 500 })]);
    expect(points[0].volumeKg).toBe(800);
  });

  it("zero objętości ZOSTAJE punktem -- tu zero jest prawdziwą wartością", () => {
    // Inaczej niż przy ciężarze: sesja z samych rozgrzewek naprawdę ma zerową
    // objętość roboczą i tak ma wyglądać na wykresie.
    const points = volumePoints([session({ displayVolumeKg: 0, heaviestSet: null })]);
    expect(points).toHaveLength(1);
    expect(points[0].volumeKg).toBe(0);
  });
});

describe("repsExtent", () => {
  it("zwraca zakres powtórzeń do skalowania punktu", () => {
    const points = weightProgressPoints([
      session({ workoutId: "w1", heaviestSet: set({ reps: 3 }) }),
      session({ workoutId: "w2", heaviestSet: set({ reps: 10 }) }),
      session({ workoutId: "w3", heaviestSet: set({ reps: 6 }) }),
    ]);
    expect(repsExtent(points)).toEqual({ min: 3, max: 10 });
  });

  it("pusty zbiór nie wywraca skalowania", () => {
    expect(repsExtent([])).toEqual({ min: 1, max: 1 });
  });
});

describe("latestValue", () => {
  it("bierze ostatni punkt, bo sesje przychodzą od najstarszej", () => {
    const points = volumePoints([
      session({ workoutId: "w1", startedAt: "2026-08-01T10:00:00Z", displayVolumeKg: 400 }),
      session({ workoutId: "w2", startedAt: "2026-09-01T10:00:00Z", displayVolumeKg: 700 }),
    ]);
    expect(latestValue(points, (p) => p.volumeKg)).toBe(700);
  });

  it("brak punktów to null, nie zero -- kafelek ma pokazać stan pusty", () => {
    expect(latestValue([], () => 1)).toBeNull();
  });
});
