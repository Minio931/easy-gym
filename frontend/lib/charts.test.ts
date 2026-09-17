import { describe, expect, it } from "vitest";
import {
  bucketForMuscleGroup,
  bucketWeeklyVolume,
  filterByRange,
  MUSCLE_GROUP_BUCKETS,
  OTHER_MUSCLE_BUCKET,
  pointRadiusForReps,
  POINT_RADIUS_MAX,
  POINT_RADIUS_MIN,
  rangeStart,
  seriesColor,
} from "@/lib/charts";

const NOW = new Date("2026-09-17T12:00:00Z");

/**
 * Asercje na polach kalendarza, nie na `toISOString()`.
 *
 * `rangeStart` liczy kalendarzowo w czasie lokalnym, więc przeskok czasu letniego
 * wewnątrz zakresu przesuwa wynikowy MOMENT o godzinę (31 marca 12:00 UTC minus
 * miesiąc to 28 lutego 13:00 UTC, bo marzec jest już w CEST, a luty w CET).
 * Dla progu odcięcia liczonego w miesiącach godzina jest bez znaczenia — ale
 * test przywiązany do konkretnego instantu byłby zależny od strefy hosta,
 * a testy w tym projekcie chodzą też pod `TZ=Asia/Tokyo`.
 */
function calendar(date: Date | null): [number, number, number] | null {
  return date === null ? null : [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

describe("rangeStart", () => {
  it("liczy kalendarzowo, nie po 30 dniach", () => {
    // „3M” ma znaczyć ten sam dzień miesiąca, bo tak to czyta użytkownik.
    const now = new Date(2026, 8, 17, 12);
    expect(calendar(rangeStart("3M", now))).toEqual([2026, 6, 17]);
    expect(calendar(rangeStart("1R", now))).toEqual([2025, 9, 17]);
  });

  it("zakres „Całość” nie ma początku", () => {
    expect(rangeStart("ALL", NOW)).toBeNull();
  });

  it("przycina dzień, gdy krótszy miesiąc go nie ma", () => {
    // 31 marca minus miesiąc to 28 lutego, nie 3 marca.
    const march31 = new Date(2026, 2, 31, 12);
    expect(calendar(rangeStart("1M", march31))).toEqual([2026, 2, 28]);
  });
});

describe("filterByRange", () => {
  const sessions = [
    { at: "2025-01-01T10:00:00Z" },
    { at: "2026-06-17T12:00:00Z" },
    { at: "2026-09-01T10:00:00Z" },
  ];
  const at = (s: { at: string }) => s.at;

  it("granica jest domknięta od dołu -- skrajny punkt zostaje", () => {
    // Gdyby była ostra, punkt dokładnie sprzed 3 miesięcy znikałby z wykresu
    // bez powodu widocznego dla patrzącego.
    expect(filterByRange(sessions, "3M", NOW, at)).toHaveLength(2);
  });

  it("zakres „Całość” oddaje wszystko, ale jako nową tablicę", () => {
    const all = filterByRange(sessions, "ALL", NOW, at);
    expect(all).toHaveLength(3);
    expect(all).not.toBe(sessions);
  });

  it("odcina starsze niż zakres", () => {
    expect(filterByRange(sessions, "1M", NOW, at)).toEqual([{ at: "2026-09-01T10:00:00Z" }]);
  });
});

describe("seriesColor", () => {
  it("oddaje token CSS, nie hex -- motyw przełącza się bez udziału TS-a", () => {
    expect(seriesColor(1)).toBe("var(--series-1)");
    expect(seriesColor(8)).toBe("var(--series-8)");
  });

  it("powyżej ósmego slotu NIE zapętla palety", () => {
    // Zapętlenie dałoby dwie serie w tym samym kolorze, czyli nie do
    // odróżnienia -- a kolejność slotów to zabezpieczenie CVD, nie estetyka.
    expect(seriesColor(9)).toBe("var(--ink-3)");
    expect(seriesColor(0)).toBe("var(--ink-3)");
    expect(seriesColor(1.5)).toBe("var(--ink-3)");
  });
});

describe("pointRadiusForReps", () => {
  it("skrajne wartości trafiają w granice promienia", () => {
    expect(pointRadiusForReps(3, 3, 12)).toBeCloseTo(POINT_RADIUS_MIN);
    expect(pointRadiusForReps(12, 3, 12)).toBeCloseTo(POINT_RADIUS_MAX);
  });

  it("skaluje POLE, nie promień", () => {
    // Środek zakresu ma mieć pole w połowie drogi między skrajnymi polami.
    const mid = pointRadiusForReps(7.5, 3, 12);
    const expected = Math.sqrt((POINT_RADIUS_MIN ** 2 + POINT_RADIUS_MAX ** 2) / 2);
    expect(mid).toBeCloseTo(expected);
    // Gdyby skalował promień liniowo, wyszłoby 6.5 -- mniej niż to.
    expect(mid).toBeGreaterThan((POINT_RADIUS_MIN + POINT_RADIUS_MAX) / 2);
  });

  it("wszystkie serie na tyle samo powtórzeń dają jednakowe punkty", () => {
    const radius = pointRadiusForReps(5, 5, 5);
    expect(radius).toBe((POINT_RADIUS_MIN + POINT_RADIUS_MAX) / 2);
  });

  it("wartości poza zakresem są przycinane, nie wychodzą poza granice", () => {
    expect(pointRadiusForReps(100, 3, 12)).toBeCloseTo(POINT_RADIUS_MAX);
    expect(pointRadiusForReps(1, 3, 12)).toBeCloseTo(POINT_RADIUS_MIN);
    expect(pointRadiusForReps(Number.NaN, 3, 12)).toBe(POINT_RADIUS_MIN);
  });
});

describe("kubełki grup mięśniowych", () => {
  it("pokrywa wszystkie 11 grup z seeda i nie gubi żadnej", () => {
    const covered = MUSCLE_GROUP_BUCKETS.flatMap((bucket) => bucket.groups);
    expect(new Set(covered).size).toBe(covered.length); // żadna grupa w dwóch kubełkach
    for (const group of [
      "klatka piersiowa", "plecy", "nogi", "łydki", "barki",
      "biceps", "triceps", "przedramiona", "pośladki", "brzuch", "całe ciało",
    ]) {
      expect(bucketForMuscleGroup(group)).not.toBe(OTHER_MUSCLE_BUCKET);
    }
  });

  it("używa dokładnie 8 slotów, każdego raz -- palety nie wolno zapętlać", () => {
    const slots = MUSCLE_GROUP_BUCKETS.map((bucket) => bucket.slot);
    expect(slots).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("grupa spoza listy trafia do 'inne', nie do losowego kubełka", () => {
    // Własne ćwiczenie może mieć dowolny `muscleGroup` wpisany ręcznie.
    // Wrzucenie go do „całe ciało" fałszowałoby dane.
    expect(bucketForMuscleGroup("kark")).toBe(OTHER_MUSCLE_BUCKET);
    expect(bucketForMuscleGroup("")).toBe(OTHER_MUSCLE_BUCKET);
  });

  it("nie przejmuje się wielkością liter ani spacjami", () => {
    expect(bucketForMuscleGroup("  Plecy  ").key).toBe("plecy");
  });

  it("sumuje grupy wpadające do tego samego kubełka", () => {
    // nogi + łydki to jeden kubełek „nogi".
    const result = bucketWeeklyVolume({ nogi: 1000, "łydki": 200, plecy: 500 });
    expect(result.map((r) => [r.bucket.key, r.kg])).toEqual([
      ["plecy", 500],
      ["nogi", 1200],
    ]);
  });

  it("sortuje po slocie, nie po wielkości -- stos nie może migać między tygodniami", () => {
    const result = bucketWeeklyVolume({ brzuch: 5000, "klatka piersiowa": 100 });
    expect(result.map((r) => r.bucket.slot)).toEqual([1, 7]);
  });

  it("pomija kubełki z zerem", () => {
    expect(bucketWeeklyVolume({ plecy: 0, nogi: 300 }).map((r) => r.bucket.key)).toEqual(["nogi"]);
  });
});
