import { describe, expect, it } from "vitest";
import {
  buildLocalWorkout,
  buildSetResponse,
  withSet,
  withoutSet,
} from "@/lib/workout/optimistic";
import type { SetResponse, WorkoutDetailResponse, WorkoutExerciseResponse } from "@/types/api";

const NOW = "2026-09-16T10:00:00Z";

function exercise(sets: SetResponse[]): WorkoutExerciseResponse {
  return {
    id: "we-1",
    workoutId: "w-1",
    exerciseId: "ex-1",
    exerciseName: "Wyciskanie",
    muscleGroup: "klatka piersiowa",
    equipment: "barbell",
    orderIndex: 0,
    notes: null,
    sets,
    displayVolumeKg: 0,
    prEligibleVolumeKg: 0,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

function workoutWith(sets: SetResponse[]): WorkoutDetailResponse {
  return { ...buildLocalWorkout("w-1", NOW, null), exercises: [exercise(sets)] };
}

function set(id: string, index: number, weightKg: number, reps: number, extra: Partial<SetResponse> = {}): SetResponse {
  return buildSetResponse(
    "we-1",
    index,
    {
      id,
      weightKg,
      reps,
      rpe: null,
      isWarmup: extra.isWarmup ?? false,
      toFailure: false,
      assisted: extra.assisted ?? false,
    },
    "epley",
    NOW,
  );
}

describe("withSet", () => {
  it("dokłada serię i przelicza objętość ćwiczenia oraz treningu", () => {
    const result = withSet(workoutWith([]), "we-1", set("s-1", 0, 100, 5));
    expect(result.exercises[0].sets).toHaveLength(1);
    expect(result.exercises[0].displayVolumeKg).toBe(500);
    expect(result.displayVolumeKg).toBe(500);
    expect(result.workingSetCount).toBe(1);
  });

  it("to upsert po id -- ponowne zatwierdzenie edytuje, nie duplikuje", () => {
    const first = withSet(workoutWith([]), "we-1", set("s-1", 0, 100, 5));
    const second = withSet(first, "we-1", set("s-1", 0, 110, 5));
    expect(second.exercises[0].sets).toHaveLength(1);
    expect(second.exercises[0].sets[0].weightKg).toBe(110);
    expect(second.displayVolumeKg).toBe(550);
  });

  it("rozgrzewka nie wchodzi do objętości ani do licznika serii roboczych", () => {
    const withWarmup = withSet(workoutWith([]), "we-1", set("s-0", 0, 60, 10, { isWarmup: true }));
    const withWorking = withSet(withWarmup, "we-1", set("s-1", 1, 100, 5));
    expect(withWorking.exercises[0].displayVolumeKg).toBe(500);
    expect(withWorking.workingSetCount).toBe(1);
  });

  it("assisted liczy się do objętości pokazywanej, ale nie do PR-owej", () => {
    const result = withSet(workoutWith([]), "we-1", set("s-1", 0, 40, 10, { assisted: true }));
    expect(result.displayVolumeKg).toBe(400);
    expect(result.prEligibleVolumeKg).toBe(0);
  });
});

describe("withoutSet", () => {
  it("przenumerowuje pozostałe serie bez dziur", () => {
    let workout = workoutWith([]);
    workout = withSet(workout, "we-1", set("s-1", 0, 100, 5));
    workout = withSet(workout, "we-1", set("s-2", 1, 105, 5));
    workout = withSet(workout, "we-1", set("s-3", 2, 110, 5));

    const result = withoutSet(workout, "we-1", "s-2");
    expect(result.exercises[0].sets.map((s) => [s.id, s.setIndex])).toEqual([
      ["s-1", 0],
      ["s-3", 1],
    ]);
    expect(result.exercises[0].displayVolumeKg).toBe(1050);
  });

  it("usunięcie nieistniejącej serii nic nie psuje", () => {
    const workout = withSet(workoutWith([]), "we-1", set("s-1", 0, 100, 5));
    expect(withoutSet(workout, "we-1", "brak").exercises[0].sets).toHaveLength(1);
  });
});
