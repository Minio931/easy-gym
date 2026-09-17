import { describe, expect, it } from "vitest";
import {
  activeBuckets,
  fillMissingWeeks,
  muscleGroupTotals,
  roundedBarPath,
  segmentEnds,
  volumeRows,
} from "@/lib/dashboard/volume";
import type { WeeklyVolumeResponse } from "@/types/api";

function week(
  weekNumber: number,
  byMuscleGroup: Record<string, number>,
  overrides: Partial<WeeklyVolumeResponse> = {},
): WeeklyVolumeResponse {
  const totalKg = Object.values(byMuscleGroup).reduce((acc, kg) => acc + kg, 0);
  return {
    year: 2026,
    week: weekNumber,
    from: "2026-09-14",
    to: "2026-09-20",
    totalKg,
    byMuscleGroup,
    workoutCount: 3,
    isDeload: false,
    ...overrides,
  };
}

describe("volumeRows", () => {
  it("kubełkuje grupy i zachowuje metadane tygodnia", () => {
    const rows = volumeRows([
      week(38, { "klatka piersiowa": 5000, triceps: 1000, biceps: 500 }, { isDeload: true }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("38");
    expect(rows[0].isDeload).toBe(true);
    expect(rows[0].kg.klatka).toBe(5000);
    // Biceps i triceps wpadają do jednego kubełka „ramiona" i się sumują.
    expect(rows[0].kg.ramiona).toBe(1500);
  });

  it("nie zostawia kubełków bez objętości", () => {
    const rows = volumeRows([week(38, { plecy: 0, nogi: 4000 })]);
    expect(Object.keys(rows[0].kg)).toEqual(["nogi"]);
  });

  it("grupa spoza listy trafia do kubełka „inne", () => {
    const rows = volumeRows([week(38, { "kark i szyja": 300 })]);
    expect(rows[0].kg.inne).toBe(300);
  });
});

describe("activeBuckets", () => {
  it("oddaje kubełki z całego zakresu w kolejności slotów", () => {
    const rows = volumeRows([
      week(37, { nogi: 4000 }),
      week(38, { "klatka piersiowa": 5000, plecy: 3000 }),
    ]);

    // Kolejność po slocie (klatka 1, plecy 2, nogi 3), a nie po tym, w którym
    // tygodniu kubełek pojawił się pierwszy raz.
    expect(activeBuckets(rows).map((bucket) => bucket.key)).toEqual(["klatka", "plecy", "nogi"]);
  });

  it("pusty zakres nie ma kubełków", () => {
    expect(activeBuckets(volumeRows([week(38, {})]))).toEqual([]);
  });
});

describe("muscleGroupTotals", () => {
  it("sumuje pełne grupy przez cały zakres i liczy udziały", () => {
    const totals = muscleGroupTotals([
      week(37, { "klatka piersiowa": 3000, biceps: 1000 }),
      week(38, { "klatka piersiowa": 5000, triceps: 1000 }),
    ]);

    expect(totals.map((total) => total.group)).toEqual(["klatka piersiowa", "biceps", "triceps"]);
    expect(totals[0].kg).toBe(8000);
    expect(totals[0].share).toBeCloseTo(0.8, 5);
    // Biceps i triceps zostają OSOBNYMI wierszami, choć dzielą kubełek —
    // to jest miejsce na pełne rozbicie, wykres pokazuje kubełki.
    expect(totals[1].bucket.key).toBe("ramiona");
    expect(totals[2].bucket.key).toBe("ramiona");
  });

  it("zakres bez objętości nie daje NaN w udziale", () => {
    expect(muscleGroupTotals([week(38, {})])).toEqual([]);
  });
});

describe("roundedBarPath", () => {
  it("zaokrągla tylko wskazane końce", () => {
    const top = roundedBarPath(0, 0, 20, 40, 4, 0);
    const none = roundedBarPath(0, 0, 20, 40, 0, 0);

    expect(top).toContain("A 4 4");
    expect(none).not.toContain("A");
    expect(none.startsWith("M 0 0")).toBe(true);
    expect(top.endsWith("Z")).toBe(true);
  });

  it("przycina promień do połowy krótszego boku", () => {
    // Segment wysoki na 4 px nie może mieć łuku o promieniu 4 px — łuki
    // z góry i z dołu wywinęłyby się poza słupek.
    expect(roundedBarPath(0, 0, 20, 4, 4, 4)).toContain("A 2 2");
  });
});

describe("segmentEnds", () => {
  const order = activeBuckets(
    volumeRows([week(38, { "klatka piersiowa": 1, plecy: 1, nogi: 1 })]),
  );

  it("wskazuje dolny i górny segment słupka", () => {
    const row = volumeRows([week(38, { "klatka piersiowa": 5000, nogi: 4000 })])[0];

    expect(segmentEnds(row, "klatka", order)).toEqual({ first: true, last: false });
    expect(segmentEnds(row, "nogi", order)).toEqual({ first: false, last: true });
  });

  it("jedyny segment jest jednocześnie dolnym i górnym", () => {
    const row = volumeRows([week(38, { plecy: 3000 })])[0];
    expect(segmentEnds(row, "plecy", order)).toEqual({ first: true, last: true });
  });

  it("kubełek nieobecny w tygodniu nie jest żadnym końcem", () => {
    const row = volumeRows([week(38, { plecy: 3000 })])[0];
    expect(segmentEnds(row, "nogi", order)).toEqual({ first: false, last: false });
  });
});

describe("fillMissingWeeks", () => {
  it("wstawia zerowe tygodnie w luki", () => {
    // Backend oddaje tylko tygodnie z treningiem: tu 17 i 20.
    const filled = fillMissingWeeks(
      [
        week(17, { nogi: 1000 }, { from: "2026-04-20", to: "2026-04-26" }),
        week(20, { nogi: 1200 }, { from: "2026-05-11", to: "2026-05-17" }),
      ],
      "2026-04-20",
      "2026-05-17",
    );

    expect(filled.map((entry) => entry.week)).toEqual([17, 18, 19, 20]);
    expect(filled[1].totalKg).toBe(0);
    expect(filled[1].workoutCount).toBe(0);
    expect(filled[1].from).toBe("2026-04-27");
    expect(filled[1].to).toBe("2026-05-03");
    // Dopełniony tydzień nie jest deloadem — deload to decyzja treningowa,
    // a nie „nic nie było".
    expect(filled[1].isDeload).toBe(false);
  });

  it("nie rusza tygodni, które przyszły z serwera", () => {
    const original = week(17, { nogi: 1000 }, { from: "2026-04-20", to: "2026-04-26", isDeload: true });
    const filled = fillMissingWeeks([original], "2026-04-20", "2026-04-26");
    expect(filled).toEqual([original]);
  });

  it("dopełnia też koniec zakresu, gdy ostatnie tygodnie są bez treningu", () => {
    // Sześć tygodni przerwy musi być widoczne na osi, inaczej słupek sprzed
    // dwóch miesięcy siada obok bieżącego i udaje zeszły tydzień.
    const filled = fillMissingWeeks(
      [week(32, { nogi: 1000 }, { from: "2026-08-03", to: "2026-08-09" })],
      "2026-08-03",
      "2026-09-20",
    );
    expect(filled).toHaveLength(7);
    expect(filled.at(-1)?.from).toBe("2026-09-14");
    expect(filled.slice(1).every((entry) => entry.totalKg === 0)).toBe(true);
  });
});
