import { describe, expect, it } from "vitest";
import { NO_FILTERS, buildExportDataset, exportFileName, type ExportSource } from "@/lib/export/dataset";
import type { BodyWeightSync, ExerciseSync, SetSync, WorkoutExerciseSync, WorkoutSync } from "@/types/sync";

const EPLEY = "epley" as const;

function exercise(id: string, name: string, muscleGroup = "klatka piersiowa"): ExerciseSync {
  return {
    id,
    name,
    muscleGroup,
    equipment: "barbell",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
  };
}

function workout(id: string, day: string, overrides: Partial<WorkoutSync> = {}): WorkoutSync {
  return {
    id,
    startedAt: `${day}T10:00:00Z`,
    endedAt: `${day}T11:00:00Z`,
    routineId: null,
    notes: null,
    isDeload: false,
    createdAt: `${day}T10:00:00Z`,
    updatedAt: `${day}T11:00:00Z`,
    deletedAt: null,
    ...overrides,
  };
}

function item(id: string, workoutId: string, exerciseId: string): WorkoutExerciseSync {
  return {
    id,
    workoutId,
    exerciseId,
    orderIndex: 0,
    notes: null,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
  };
}

function set(
  id: string,
  workoutExerciseId: string,
  setIndex: number,
  weightKg: number,
  reps: number,
  overrides: Partial<SetSync> = {},
): SetSync {
  return {
    id,
    workoutExerciseId,
    setIndex,
    weightKg,
    reps,
    rpe: null,
    isWarmup: false,
    toFailure: false,
    assisted: false,
    completedAt: "2026-05-04T10:30:00Z",
    updatedAt: "2026-05-04T10:30:00Z",
    deletedAt: null,
    ...overrides,
  };
}

/** Dwie sesje wyciskania: 100 kg × 5, potem 105 kg × 5 (progres + PR). */
function twoSessions(): ExportSource {
  return {
    exercises: [exercise("ex-a", "Wyciskanie")],
    workouts: [workout("w1", "2026-05-04"), workout("w2", "2026-05-11")],
    workoutExercises: [item("we1", "w1", "ex-a"), item("we2", "w2", "ex-a")],
    sets: [
      set("s0", "we1", 0, 60, 10, { isWarmup: true }),
      set("s1", "we1", 1, 100, 5),
      set("s2", "we2", 0, 105, 5),
    ],
    bodyWeights: [],
  };
}

describe("buildExportDataset — arkusz Serie", () => {
  it("jeden wiersz = jedna seria, z objętością i e1RM", () => {
    const data = buildExportDataset(twoSessions(), NO_FILTERS, EPLEY);
    expect(data.sets).toHaveLength(3);

    const working = data.sets.find((row) => row.weightKg === 100);
    expect(working).toMatchObject({
      exerciseName: "Wyciskanie",
      muscleGroup: "klatka piersiowa",
      setIndex: 2,
      reps: 5,
      volumeKg: 500,
      isWarmup: false,
    });
    // Epley: 100 × (1 + 5/30) = 116.67
    expect(working?.e1rmKg).toBeCloseTo(116.67, 2);
  });

  it("rozgrzewka ma objętość 0 i nie ma e1RM", () => {
    const warmup = buildExportDataset(twoSessions(), NO_FILTERS, EPLEY).sets.find(
      (row) => row.isWarmup,
    );
    expect(warmup?.volumeKg).toBe(0);
    expect(warmup?.e1rmKg).toBeNull();
  });

  it("„tylko serie robocze” wyrzuca rozgrzewkę z arkusza", () => {
    const data = buildExportDataset(twoSessions(), { ...NO_FILTERS, workingSetsOnly: true }, EPLEY);
    expect(data.sets.every((row) => !row.isWarmup)).toBe(true);
    expect(data.sets).toHaveLength(2);
  });

  it("tombstone'y nie trafiają do eksportu", () => {
    const source = twoSessions();
    const data = buildExportDataset(
      { ...source, sets: source.sets.map((s) => (s.id === "s2" ? { ...s, deletedAt: "2026-06-01T00:00:00Z" } : s)) },
      NO_FILTERS,
      EPLEY,
    );
    expect(data.sets.map((row) => row.weightKg)).not.toContain(105);
  });
});

describe("buildExportDataset — kolumna PR", () => {
  it("oznacza serię, która pobiła rekord W MOMENCIE wykonania", () => {
    const data = buildExportDataset(twoSessions(), NO_FILTERS, EPLEY);
    const byWeight = new Map(data.sets.map((row) => [row.weightKg, row.isPersonalRecord]));
    // Pierwsza seria robocza ustanawia rekord, druga go bije — obie są PR.
    expect(byWeight.get(100)).toBe(true);
    expect(byWeight.get(105)).toBe(true);
  });

  it("cofnięcie się nie jest rekordem", () => {
    const source = twoSessions();
    const data = buildExportDataset(
      { ...source, sets: source.sets.map((s) => (s.id === "s2" ? { ...s, weightKg: 95 } : s)) },
      NO_FILTERS,
      EPLEY,
    );
    expect(data.sets.find((row) => row.weightKg === 95)?.isPersonalRecord).toBe(false);
  });

  it("rekordy liczą się na PEŁNEJ historii, nie na zakresie eksportu", () => {
    // Eksport samego maja: 105 kg z 11.05 nadal jest rekordem, ale gdyby
    // historię obciąć do zakresu, „rekordem” zostałaby też pierwsza seria
    // w oknie — i każdy eksport produkowałby własne, fałszywe PR-y.
    const source = twoSessions();
    const data = buildExportDataset(
      source,
      { ...NO_FILTERS, from: "2026-05-10", to: "2026-05-20" },
      EPLEY,
    );
    expect(data.sets).toHaveLength(1);
    expect(data.sets[0].weightKg).toBe(105);
    expect(data.sets[0].isPersonalRecord).toBe(true);
  });

  it("seria z asystą nie ustanawia rekordu", () => {
    const source = twoSessions();
    const data = buildExportDataset(
      { ...source, sets: source.sets.map((s) => (s.id === "s2" ? { ...s, assisted: true } : s)) },
      NO_FILTERS,
      EPLEY,
    );
    expect(data.sets.find((row) => row.weightKg === 105)?.isPersonalRecord).toBe(false);
  });
});

describe("buildExportDataset — arkusze Treningi i Progres", () => {
  it("trening ma dzień tygodnia, czas trwania i objętość bez rozgrzewki", () => {
    const data = buildExportDataset(twoSessions(), NO_FILTERS, EPLEY);
    expect(data.workouts).toHaveLength(2);
    expect(data.workouts[0]).toMatchObject({
      date: "2026-05-04",
      weekday: "poniedziałek",
      durationSeconds: 3600,
      setCount: 1,
      volumeKg: 500,
    });
  });

  it("progres liczy przyrost między pierwszą a ostatnią sesją", () => {
    const progress = buildExportDataset(twoSessions(), NO_FILTERS, EPLEY).progress;
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({
      exerciseName: "Wyciskanie",
      firstWeightKg: 100,
      lastWeightKg: 105,
      bestWeightKg: 105,
      gainKg: 5,
    });
    expect(progress[0].gainPercent).toBeCloseTo(5, 5);
  });

  it("jedna sesja to BRAK przyrostu, nie zero procent", () => {
    const source = twoSessions();
    const progress = buildExportDataset(
      { ...source, workouts: [source.workouts[0]], workoutExercises: [source.workoutExercises[0]] },
      NO_FILTERS,
      EPLEY,
    ).progress;
    expect(progress[0].gainPercent).toBeNull();
  });

  it("filtr ćwiczeń zawęża arkusze, a trening bez pasujących ćwiczeń znika", () => {
    const source = twoSessions();
    const data = buildExportDataset(
      { ...source, exercises: [...source.exercises, exercise("ex-b", "Przysiad", "nogi")] },
      { ...NO_FILTERS, exerciseIds: ["ex-b"] },
      EPLEY,
    );
    expect(data.sets).toHaveLength(0);
    expect(data.workouts).toHaveLength(0);
  });
});

describe("buildExportDataset — waga ciała", () => {
  const weights: BodyWeightSync[] = [
    { id: "b1", measuredOn: "2026-05-04", weightKg: 80, note: null, updatedAt: "", deletedAt: null },
    { id: "b2", measuredOn: "2026-05-06", weightKg: 81, note: null, updatedAt: "", deletedAt: null },
    { id: "b3", measuredOn: "2026-05-11", weightKg: 79.5, note: null, updatedAt: "", deletedAt: null },
  ];

  it("dzienne wiersze niosą kroczącą 7-dniową", () => {
    const data = buildExportDataset({ ...twoSessions(), bodyWeights: weights }, NO_FILTERS, EPLEY);
    expect(data.bodyWeight.map((row) => row.date)).toEqual([
      "2026-05-04",
      "2026-05-06",
      "2026-05-11",
    ]);
    // Okno 04–06.05 obejmuje oba pomiary: (80 + 81) / 2.
    expect(data.bodyWeight[1].rollingSevenDayKg).toBeCloseTo(80.5, 2);
  });

  it("krocząca liczy się na pełnej serii, nie na przyciętej zakresem", () => {
    // Gdyby filtr działał PRZED liczeniem, 06.05 nie miałby w oknie 04.05
    // i pokazałby 81 zamiast 80.5.
    const data = buildExportDataset(
      { ...twoSessions(), bodyWeights: weights },
      { ...NO_FILTERS, from: "2026-05-06" },
      EPLEY,
    );
    expect(data.bodyWeight[0].date).toBe("2026-05-06");
    expect(data.bodyWeight[0].rollingSevenDayKg).toBeCloseTo(80.5, 2);
  });

  it("arkusz tygodniowy ma zakres dat, średnią i deltę", () => {
    const data = buildExportDataset({ ...twoSessions(), bodyWeights: weights }, NO_FILTERS, EPLEY);
    expect(data.weeklyWeight).toHaveLength(2);
    expect(data.weeklyWeight[0]).toMatchObject({
      year: 2026,
      week: 19,
      from: "2026-05-04",
      to: "2026-05-10",
      measurementCount: 2,
      averageKg: 80.5,
      deltaKg: null,
    });
    expect(data.weeklyWeight[1].deltaKg).toBeCloseTo(-1, 5);
  });
});

describe("buildExportDataset — podsumowanie", () => {
  it("zlicza treningi, objętość i serie robocze oraz zmianę wagi", () => {
    const data = buildExportDataset(
      {
        ...twoSessions(),
        bodyWeights: [
          { id: "b1", measuredOn: "2026-05-04", weightKg: 80, note: null, updatedAt: "", deletedAt: null },
          { id: "b2", measuredOn: "2026-05-11", weightKg: 79, note: null, updatedAt: "", deletedAt: null },
        ],
      },
      NO_FILTERS,
      EPLEY,
    );
    expect(data.summary).toMatchObject({
      workoutCount: 2,
      workingSetCount: 2,
      totalVolumeKg: 1025,
      bodyWeightStartKg: 80,
      bodyWeightEndKg: 79,
      bodyWeightDeltaKg: -1,
    });
    expect(data.summary.records.map((record) => record.category)).toEqual([
      "Najwyższy ciężar",
      "Najwyższy e1RM",
    ]);
  });
});

describe("exportFileName", () => {
  it("bez filtra dat bierze dzisiejszą datę", () => {
    expect(exportFileName(NO_FILTERS, new Date(2026, 8, 17))).toBe("easy-gym-2026-09-17.xlsx");
  });

  it("z zakresem niesie zakres w nazwie", () => {
    expect(
      exportFileName({ ...NO_FILTERS, from: "2026-01-01", to: "2026-03-31" }, new Date(2026, 8, 17)),
    ).toBe("easy-gym-2026-01-01_2026-03-31.xlsx");
  });
});
