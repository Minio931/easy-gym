import { describe, expect, it } from "vitest";
import {
  addItem,
  draftFromRoutine,
  draftFromWorkout,
  emptyDraft,
  moveItem,
  parseTarget,
  removeItem,
  setItemTarget,
  toSaveRequest,
  totalTargetSets,
  validateDraft,
  TARGET_REPS_MAX,
  TARGET_REPS_MIN,
  TARGET_SETS_MAX,
  TARGET_SETS_MIN,
  type RoutineDraft,
} from "@/lib/routines/draft";
import type { ExerciseResponse, RoutineResponse, WorkoutDetailResponse } from "@/types/api";

function exercise(id: string, name: string): ExerciseResponse {
  return {
    id,
    userId: null,
    global: true,
    name,
    muscleGroup: "nogi",
    equipment: "barbell",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
  };
}

function draftWith(names: string[]): RoutineDraft {
  return names.reduce(
    (draft, name, index) => addItem(draft, exercise(`ex-${String(index)}`, name)),
    { ...emptyDraft(), name: "Push A" },
  );
}

describe("draftFromRoutine", () => {
  const routine: RoutineResponse = {
    id: "r1",
    name: "Push A",
    notes: null,
    items: [
      {
        id: "i2",
        routineId: "r1",
        exerciseId: "ex-b",
        orderIndex: 1,
        targetSets: 4,
        targetReps: 8,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: "i1",
        routineId: "r1",
        exerciseId: "ex-a",
        orderIndex: 0,
        targetSets: 3,
        targetReps: 5,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: "i0",
        routineId: "r1",
        exerciseId: "ex-usuniete",
        orderIndex: 2,
        targetSets: null,
        targetReps: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: "2026-05-01T00:00:00Z",
      },
    ],
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
  };

  it("porządkuje pozycje po orderIndex i pomija tombstone'y", () => {
    const draft = draftFromRoutine(routine, new Map([["ex-a", "Przysiad"], ["ex-b", "Wyciskanie"]]));
    expect(draft.items.map((item) => item.exerciseName)).toEqual(["Przysiad", "Wyciskanie"]);
    expect(draft.id).toBe("r1");
  });

  it("nazywa wprost ćwiczenie, którego nie ma w katalogu", () => {
    // Odpowiedź szablonu niesie same `exerciseId` — brak w katalogu znaczy
    // „skasowane albo katalog jeszcze nie doszedł", a nie „?".
    const draft = draftFromRoutine(routine, new Map());
    expect(draft.items[0].exerciseName).toBe("Ćwiczenie spoza katalogu");
  });
});

describe("draftFromWorkout", () => {
  const workout = {
    exercises: [
      {
        exerciseId: "ex-a",
        exerciseName: "Przysiad",
        sets: [
          { reps: 10, isWarmup: true, deletedAt: null },
          { reps: 5, isWarmup: false, deletedAt: null },
          { reps: 5, isWarmup: false, deletedAt: null },
          { reps: 3, isWarmup: false, deletedAt: null },
          { reps: 8, isWarmup: false, deletedAt: "2026-05-01T00:00:00Z" },
        ],
      },
      {
        exerciseId: "ex-b",
        exerciseName: "Rozgrzewkowe",
        sets: [{ reps: 12, isWarmup: true, deletedAt: null }],
      },
    ],
  } as unknown as WorkoutDetailResponse;

  it("celem serii jest liczba serii ROBOCZYCH, bez rozgrzewki i bez skasowanych", () => {
    const draft = draftFromWorkout(workout, "Nogi poniedziałek");
    expect(draft.name).toBe("Nogi poniedziałek");
    expect(draft.items[0].targetSets).toBe(3);
  });

  it("celem powtórzeń jest mediana serii roboczych", () => {
    // Serie robocze: 5, 5, 3 (rozgrzewka i skasowana nie liczą się).
    expect(draftFromWorkout(workout, "x").items[0].targetReps).toBe(5);
  });

  it("drabina 3/2/1 daje cel 2, a nie 1", () => {
    // Prawdziwy trening z konta testowego. Reguła „najczęstsza liczba
    // powtórzeń" musiała tu rozstrzygać remis i robiła z sesji plan
    // „3 serie × 1 powtórzenie".
    const ladder = {
      exercises: [
        {
          exerciseId: "ex-a",
          exerciseName: "Wyciskanie",
          sets: [
            { reps: 10, isWarmup: true, deletedAt: null },
            { reps: 3, isWarmup: false, deletedAt: null },
            { reps: 2, isWarmup: false, deletedAt: null },
            { reps: 1, isWarmup: false, deletedAt: null },
          ],
        },
      ],
    } as unknown as WorkoutDetailResponse;
    expect(draftFromWorkout(ladder, "x").items[0].targetReps).toBe(2);
  });

  it("przy parzystej liczbie serii bierze dolny środek", () => {
    const even = {
      exercises: [
        {
          exerciseId: "ex-a",
          exerciseName: "Wiosłowanie",
          sets: [
            { reps: 8, isWarmup: false, deletedAt: null },
            { reps: 6, isWarmup: false, deletedAt: null },
          ],
        },
      ],
    } as unknown as WorkoutDetailResponse;
    expect(draftFromWorkout(even, "x").items[0].targetReps).toBe(6);
  });

  it("ćwiczenie z samej rozgrzewki zostaje w szablonie, ale bez celów", () => {
    // Ćwiczenie było w sesji, więc należy do planu; zmyślanie mu celów byłoby
    // wpisaniem liczby, której nikt nie wykonał.
    const item = draftFromWorkout(workout, "x").items[1];
    expect(item.exerciseId).toBe("ex-b");
    expect(item.targetSets).toBeNull();
    expect(item.targetReps).toBeNull();
  });
});

describe("zmiany szkicu", () => {
  it("dodaje ćwiczenie na koniec, bez celów", () => {
    const draft = addItem(emptyDraft(), exercise("ex-a", "Przysiad"));
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({ id: null, exerciseId: "ex-a", targetSets: null });
  });

  it("to samo ćwiczenie można dodać dwa razy", () => {
    // Pozycja szablonu to nie zbiór: „przysiad ciężki" i „przysiad lekki"
    // w jednej sesji są normalne.
    const once = addItem(emptyDraft(), exercise("ex-a", "Przysiad"));
    expect(addItem(once, exercise("ex-a", "Przysiad")).items).toHaveLength(2);
  });

  it("przesuwa pozycję o jeden", () => {
    const draft = draftWith(["A", "B", "C"]);
    expect(moveItem(draft, 1, -1).items.map((i) => i.exerciseName)).toEqual(["B", "A", "C"]);
    expect(moveItem(draft, 1, 1).items.map((i) => i.exerciseName)).toEqual(["A", "C", "B"]);
  });

  it("przesunięcie poza listę nie zapętla kolejności", () => {
    const draft = draftWith(["A", "B"]);
    expect(moveItem(draft, 0, -1)).toBe(draft);
    expect(moveItem(draft, 1, 1)).toBe(draft);
  });

  it("usuwa wskazaną pozycję, nie pierwszą pasującą nazwę", () => {
    const draft = draftWith(["A", "B", "A"]);
    expect(removeItem(draft, 2).items.map((i) => i.exerciseName)).toEqual(["A", "B"]);
  });

  it("ustawia cel tylko wskazanej pozycji", () => {
    const draft = setItemTarget(draftWith(["A", "B"]), 1, { targetSets: 4 });
    expect(draft.items[0].targetSets).toBeNull();
    expect(draft.items[1].targetSets).toBe(4);
  });
});

describe("parseTarget", () => {
  it("puste pole to brak celu, nie zero", () => {
    expect(parseTarget("", TARGET_SETS_MIN, TARGET_SETS_MAX)).toBeNull();
    expect(parseTarget("   ", TARGET_SETS_MIN, TARGET_SETS_MAX)).toBeNull();
  });

  it("przycina do granic backendu zamiast odrzucać", () => {
    expect(parseTarget("0", TARGET_SETS_MIN, TARGET_SETS_MAX)).toBe(1);
    expect(parseTarget("99", TARGET_SETS_MIN, TARGET_SETS_MAX)).toBe(50);
    expect(parseTarget("500", TARGET_REPS_MIN, TARGET_REPS_MAX)).toBe(100);
  });

  it("tekst nie jest celem", () => {
    expect(parseTarget("abc", TARGET_SETS_MIN, TARGET_SETS_MAX)).toBeNull();
  });
});

describe("validateDraft", () => {
  it("szablon bez nazwy i bez ćwiczeń nie przechodzi", () => {
    expect(validateDraft(emptyDraft())).toBe("Szablon musi mieć nazwę.");
    expect(validateDraft({ ...emptyDraft(), name: "Push A" })).toBe(
      "Dodaj przynajmniej jedno ćwiczenie.",
    );
  });

  it("sama spacja to nie nazwa", () => {
    expect(validateDraft({ ...draftWith(["A"]), name: "   " })).toBe("Szablon musi mieć nazwę.");
  });

  it("poprawny szkic nie ma błędu", () => {
    expect(validateDraft(draftWith(["A"]))).toBeNull();
  });
});

describe("toSaveRequest", () => {
  it("numeruje pozycje kolejnością na liście i przycina nazwę", () => {
    const draft = { ...draftWith(["A", "B"]), name: "  Push A  " };
    const request = toSaveRequest(draft);
    expect(request.name).toBe("Push A");
    expect(request.items.map((item) => item.orderIndex)).toEqual([0, 1]);
  });

  it("nowy szablon i nowa pozycja idą BEZ id", () => {
    const request = toSaveRequest(draftWith(["A"]));
    expect("id" in request).toBe(false);
    expect("id" in request.items[0]).toBe(false);
  });

  it("istniejące id zostaje, żeby PUT nie zrobił z edycji nowego szablonu", () => {
    const draft: RoutineDraft = {
      id: "r1",
      name: "Push A",
      notes: "",
      items: [{ id: "i1", exerciseId: "ex-a", exerciseName: "A", targetSets: 3, targetReps: 5 }],
    };
    const request = toSaveRequest(draft);
    expect(request.id).toBe("r1");
    expect(request.items[0].id).toBe("i1");
  });

  it("pusta notatka to null, nie pusty string", () => {
    expect(toSaveRequest(draftWith(["A"])).notes).toBeNull();
  });
});

describe("totalTargetSets", () => {
  it("sumuje cele żywych pozycji", () => {
    const routine = {
      items: [
        { targetSets: 3, deletedAt: null },
        { targetSets: 4, deletedAt: null },
        { targetSets: null, deletedAt: null },
        { targetSets: 9, deletedAt: "2026-05-01T00:00:00Z" },
      ],
    } as unknown as RoutineResponse;
    expect(totalTargetSets(routine)).toBe(7);
  });
});
