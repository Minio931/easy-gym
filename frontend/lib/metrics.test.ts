/**
 * Mirror testów JUnit z ../backend/src/test/java/com/example/easygymbackend/
 * metrics. Te same przypadki i te same oczekiwane liczby — jeśli któryś z
 * nich przestanie przechodzić po obu stronach jednocześnie, znaczy że reguła
 * rozjechała się między frontem a eksportem z serwera.
 *
 * Wartości brzegowe tygodnia ISO policzone z reguły „tydzień 1 zawiera
 * pierwszy czwartek stycznia", nie odczytane z implementacji pod testem.
 */

import { describe, expect, it } from "vitest";
import {
  compareIsoWeeks,
  compareToPreviousWeek,
  computePersonalRecords,
  displayVolumeKg,
  estimate1RM,
  heaviestSet,
  isoWeekMondayStart,
  isoWeekOfDate,
  isoWeekOfInstant,
  isoWeekSundayEnd,
  personalRecordsBrokenIn,
  prEligibleVolumeKg,
  repRangeBucket,
  round2,
  sevenDayRollingAverage,
  weeklyAverages,
  weekOverWeekDeltaKg,
  weekOverWeekDeltaPercent,
  type ExerciseSet,
  type WeeklyBodyWeightAverage,
  type WorkoutSession,
} from "@/lib/metrics";

let nextId = 0;

function set(
  weightKg: number,
  reps: number,
  options: { warmup?: boolean; assisted?: boolean; toFailure?: boolean } = {},
): ExerciseSet {
  nextId += 1;
  return {
    setId: `set-${nextId}`,
    completedAt: "2026-06-10T18:00:00Z",
    weightKg,
    reps,
    isWarmup: options.warmup ?? false,
    toFailure: options.toFailure ?? false,
    assisted: options.assisted ?? false,
  };
}

function session(sets: ExerciseSet[]): WorkoutSession {
  nextId += 1;
  return { workoutId: `workout-${nextId}`, sets };
}

describe("round2", () => {
  it("zaokrągla połówki w górę co do modułu, jak RoundingMode.HALF_UP w Javie", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(102.50000000000001)).toBe(102.5);
    expect(round2(116.66666666666667)).toBe(116.67);
  });
});

describe("estimate1RM", () => {
  it("dla jednego powtórzenia zwraca samą wagę, niezależnie od formuły", () => {
    expect(estimate1RM(100, 1, "epley")).toBe(100);
    expect(estimate1RM(100, 1, "brzycki")).toBe(100);
  });

  it("Epley liczy zgodnie ze wzorem: 100 × (1 + 5/30) = 116.67", () => {
    expect(estimate1RM(100, 5, "epley")).toBe(116.67);
  });

  it("Brzycki liczy zgodnie ze wzorem: 100 × 36 / (37 − 10) = 133.33", () => {
    expect(estimate1RM(100, 10, "brzycki")).toBe(133.33);
  });

  it("Brzycki na granicy 36 powtórzeń jeszcze działa", () => {
    expect(estimate1RM(10, 36, "brzycki")).toBe(360);
  });

  it("Brzycki dzieli przez zero przy 37 powtórzeniach — zwracamy null, nie liczbę", () => {
    expect(estimate1RM(10, 37, "brzycki")).toBeNull();
  });

  it("Brzycki powyżej 37 powtórzeń dałby ujemny wynik — też null (40 pompek do odmowy)", () => {
    expect(estimate1RM(70, 40, "brzycki")).toBeNull();
  });

  it("Epley nie ma tej granicy i liczy się zawsze", () => {
    expect(estimate1RM(70, 40, "epley")).not.toBeNull();
  });
});

describe("repRangeBucket", () => {
  it("mapuje granice zakresów poprawnie", () => {
    expect(repRangeBucket(1)).toBe("1");
    expect(repRangeBucket(2)).toBe("2-3");
    expect(repRangeBucket(3)).toBe("2-3");
    expect(repRangeBucket(4)).toBe("4-6");
    expect(repRangeBucket(6)).toBe("4-6");
    expect(repRangeBucket(7)).toBe("7-10");
    expect(repRangeBucket(10)).toBe("7-10");
    expect(repRangeBucket(11)).toBe("11-15");
    expect(repRangeBucket(15)).toBe("11-15");
    expect(repRangeBucket(16)).toBe("15+");
    expect(repRangeBucket(100)).toBe("15+");
  });
});

describe("objętość sesji", () => {
  const sets = [
    set(20, 10, { warmup: true }), // rozgrzewka — pominięta w obu
    set(100, 5), // 500
    set(80, 5, { assisted: true }), // 400
  ];

  it("displayVolume wlicza assisted i pomija rozgrzewkę", () => {
    expect(displayVolumeKg(sets)).toBe(900);
  });

  it("prEligibleVolume wyklucza assisted i rozgrzewkę", () => {
    expect(prEligibleVolumeKg(sets)).toBe(500);
  });

  it("pusta lista daje zero", () => {
    expect(displayVolumeKg([])).toBe(0);
    expect(heaviestSet([])).toBeNull();
  });
});

describe("heaviestSet", () => {
  it("pomija assisted i rozgrzewkę", () => {
    const best = set(120, 3);
    const result = heaviestSet([set(150, 1, { assisted: true }), set(200, 1, { warmup: true }), best]);
    expect(result).toBe(best);
  });

  it("przy remisie wygrywa większa liczba powtórzeń", () => {
    const fewerReps = set(100, 3);
    const moreReps = set(100, 8);
    expect(heaviestSet([fewerReps, moreReps])).toBe(moreReps);
  });
});

describe("computePersonalRecords", () => {
  it("znajduje największy ciężar z pominięciem assisted i rozgrzewki", () => {
    const best = set(140, 3);
    const records = computePersonalRecords(
      [session([set(160, 1, { assisted: true }), set(200, 1, { warmup: true }), best])],
      "epley",
    );

    expect(records.maxWeight).toEqual({ setId: best.setId, value: 140 });
  });

  it("objętość sesyjna do PR ignoruje assisted, inaczej niż wyświetlana objętość", () => {
    const withAssisted = session([set(100, 5), set(80, 5, { assisted: true })]);

    const records = computePersonalRecords([withAssisted], "epley");

    expect(records.maxSessionVolume).toEqual({ workoutId: withAssisted.workoutId, value: 500 });
    expect(displayVolumeKg(withAssisted.sets)).toBe(900);
  });

  it("śledzi rekord per zakres powtórzeń osobno", () => {
    const records = computePersonalRecords([session([set(150, 1), set(120, 5)])], "epley");

    expect(records.byRepRange["1"]?.value).toBe(150);
    expect(records.byRepRange["4-6"]?.value).toBe(120);
    expect(records.byRepRange["7-10"]).toBeUndefined();
  });

  it("pusta lista sesji daje puste rekordy", () => {
    const records = computePersonalRecords([], "epley");

    expect(records.maxWeight).toBeNull();
    expect(records.maxE1rm).toBeNull();
    expect(records.maxSessionVolume).toBeNull();
    expect(records.byRepRange).toEqual({});
  });

  it("serie z e1RM = null (Brzycki powyżej 36 powt.) nie psują rekordu e1RM", () => {
    const records = computePersonalRecords([session([set(70, 40), set(100, 5)])], "brzycki");

    expect(records.maxE1rm?.value).toBe(estimate1RM(100, 5, "brzycki"));
  });
});

describe("personalRecordsBrokenIn", () => {
  it("nie zgłasza rekordu, którego ostatnia sesja nie pobiła", () => {
    const broken = personalRecordsBrokenIn(
      [session([set(100, 5)]), session([set(90, 5)])],
      "epley",
    );

    expect(broken.maxWeight).toBeNull();
  });

  it("wykrywa faktyczne pobicie rekordu w ostatniej sesji", () => {
    const newRecord = set(110, 5);
    const broken = personalRecordsBrokenIn(
      [session([set(100, 5)]), session([newRecord])],
      "epley",
    );

    expect(broken.maxWeight?.setId).toBe(newRecord.setId);
  });

  it("remis to NIE pobicie rekordu", () => {
    const broken = personalRecordsBrokenIn(
      [session([set(100, 5)]), session([set(100, 5)])],
      "epley",
    );

    expect(broken.maxWeight).toBeNull();
  });
});

describe("tydzień ISO", () => {
  it("zwykły środek tygodnia", () => {
    expect(isoWeekOfDate("2026-06-10")).toEqual({ year: 2026, week: 24 });
  });

  it("1 stycznia 2023 (niedziela) należy do tygodnia 52/2022", () => {
    expect(isoWeekOfDate("2023-01-01")).toEqual({ year: 2022, week: 52 });
    expect(isoWeekOfDate("2022-12-31")).toEqual({ year: 2022, week: 52 });
  });

  it("29 grudnia 2025 (poniedziałek) to już tydzień 1/2026", () => {
    expect(isoWeekOfDate("2025-12-29")).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOfDate("2026-01-01")).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOfDate("2025-12-28")).toEqual({ year: 2025, week: 52 });
  });

  it("tydzień 53 istnieje (2020) i sięga do 3 stycznia 2021", () => {
    expect(isoWeekOfDate("2020-12-31")).toEqual({ year: 2020, week: 53 });
    expect(isoWeekOfDate("2021-01-01")).toEqual({ year: 2020, week: 53 });
    expect(isoWeekOfDate("2021-01-03")).toEqual({ year: 2020, week: 53 });
    expect(isoWeekOfDate("2021-01-04")).toEqual({ year: 2021, week: 1 });
  });

  it("mondayStart i sundayEnd dają spójny roundtrip", () => {
    expect(isoWeekMondayStart({ year: 2020, week: 53 })).toBe("2020-12-28");
    expect(isoWeekSundayEnd({ year: 2020, week: 53 })).toBe("2021-01-03");
    expect(isoWeekOfDate(isoWeekMondayStart({ year: 2020, week: 53 }))).toEqual({
      year: 2020,
      week: 53,
    });
    expect(isoWeekMondayStart({ year: 2026, week: 1 })).toBe("2025-12-29");
  });

  it("granica północy w Warszawie — wiosenna zmiana czasu", () => {
    // 29.03.2026, zegary 2:00 -> 3:00 CEST. 23:30 lokalnie = 21:30 UTC.
    const sundayLateNight = isoWeekOfInstant("2026-03-29T21:30:00Z");
    // 00:30 w poniedziałek lokalnie = 22:30 UTC tego samego dnia UTC.
    const mondayJustAfterMidnight = isoWeekOfInstant("2026-03-29T22:30:00Z");

    expect(mondayJustAfterMidnight).not.toEqual(sundayLateNight);
    expect(isoWeekMondayStart(mondayJustAfterMidnight)).toBe("2026-03-30");
  });

  it("granica północy w Warszawie — jesienna zmiana czasu", () => {
    // 25.10.2026, zegary 3:00 -> 2:00 CET. 23:30 lokalnie = 22:30 UTC.
    const sundayLateNight = isoWeekOfInstant("2026-10-25T22:30:00Z");
    const mondayJustAfterMidnight = isoWeekOfInstant("2026-10-25T23:30:00Z");

    expect(mondayJustAfterMidnight).not.toEqual(sundayLateNight);
    expect(isoWeekMondayStart(mondayJustAfterMidnight)).toBe("2026-10-26");
  });

  it("porządkowanie chronologiczne działa przez rok i przez tydzień 53", () => {
    expect(compareIsoWeeks({ year: 2020, week: 53 }, { year: 2021, week: 1 })).toBeLessThan(0);
    expect(compareIsoWeeks({ year: 2021, week: 1 }, { year: 2022, week: 52 })).toBeLessThan(0);
  });
});

describe("waga ciała", () => {
  it("grupuje pomiary w tygodnie i liczy średnią", () => {
    const weeks = weeklyAverages([
      { measuredOn: "2026-06-08", weightKg: 80 },
      { measuredOn: "2026-06-09", weightKg: 81 },
      { measuredOn: "2026-06-10", weightKg: 82 },
    ]);

    expect(weeks).toHaveLength(1);
    expect(weeks[0].measurementCount).toBe(3);
    expect(weeks[0].averageKg).toBe(81);
    expect(weeks[0].incomplete).toBe(false);
  });

  it("tydzień z jednym pomiarem jest niepełny", () => {
    const weeks = weeklyAverages([{ measuredOn: "2026-06-08", weightKg: 80 }]);

    expect(weeks[0].incomplete).toBe(true);
    expect(weeks[0].measurementCount).toBe(1);
  });

  it("delta tydzień do tygodnia liczona względem poprzedniego", () => {
    const weeks: WeeklyBodyWeightAverage[] = [
      { week: { year: 2026, week: 23 }, measurementCount: 3, averageKg: 80, incomplete: false },
      { week: { year: 2026, week: 24 }, measurementCount: 3, averageKg: 81, incomplete: false },
    ];

    expect(weekOverWeekDeltaKg(weeks, { year: 2026, week: 24 })).toBe(1);
    expect(weekOverWeekDeltaPercent(weeks, { year: 2026, week: 24 })).toBe(1.25);
  });

  it("brak poprzedniego tygodnia daje null", () => {
    const weeks: WeeklyBodyWeightAverage[] = [
      { week: { year: 2026, week: 23 }, measurementCount: 3, averageKg: 80, incomplete: false },
    ];

    expect(weekOverWeekDeltaKg(weeks, { year: 2026, week: 23 })).toBeNull();
  });

  it("średnia krocząca 7-dniowa liczy się z okna istniejących pomiarów", () => {
    const rolling = sevenDayRollingAverage([
      { measuredOn: "2026-06-01", weightKg: 80 },
      { measuredOn: "2026-06-02", weightKg: 82 },
    ]);

    expect(rolling.get("2026-06-01")).toBe(80);
    expect(rolling.get("2026-06-02")).toBe(81);
  });

  it("pomiar starszy niż 7 dni wypada z okna", () => {
    const rolling = sevenDayRollingAverage([
      { measuredOn: "2026-06-01", weightKg: 100 },
      { measuredOn: "2026-06-09", weightKg: 80 },
    ]);

    expect(rolling.get("2026-06-09")).toBe(80);
  });
});

describe("compareToPreviousWeek", () => {
  const weeks = [
    { week: { year: 2026, week: 1 }, value: 1000, isDeload: false },
    { week: { year: 2026, week: 2 }, value: 400, isDeload: true },
    { week: { year: 2026, week: 3 }, value: 1050, isDeload: false },
  ];

  it("domyślnie deload znika z łańcucha porównań", () => {
    const result = compareToPreviousWeek(weeks, { year: 2026, week: 3 });

    expect(result).toEqual({ previousValue: 1000, currentValue: 1050, deltaPercent: 5 });
  });

  it("sam tydzień deload nie ma porównania w trybie domyślnym", () => {
    expect(compareToPreviousWeek(weeks.slice(0, 2), { year: 2026, week: 2 })).toBeNull();
  });

  it("includeDeload włącza deload z powrotem do łańcucha", () => {
    const result = compareToPreviousWeek(weeks.slice(0, 2), { year: 2026, week: 2 }, true);

    expect(result).toEqual({ previousValue: 1000, currentValue: 400, deltaPercent: -60 });
  });

  it("pierwszy tydzień bez poprzednika nie ma porównania", () => {
    expect(compareToPreviousWeek(weeks.slice(0, 1), { year: 2026, week: 1 })).toBeNull();
  });
});
