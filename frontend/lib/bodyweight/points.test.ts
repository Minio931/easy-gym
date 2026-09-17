import { describe, expect, it } from "vitest";
import { dayToTime, rawPoints, weeklyPoints, weightDomain } from "@/lib/bodyweight/points";
import type { BodyWeightResponse, WeeklyBodyWeightResponse } from "@/types/api";

function entry(measuredOn: string, weightKg: number): BodyWeightResponse {
  return {
    id: `e-${measuredOn}`,
    measuredOn,
    weightKg,
    note: null,
    updatedAt: `${measuredOn}T06:00:00Z`,
    deletedAt: null,
  };
}

function week(
  year: number,
  weekNumber: number,
  from: string,
  to: string,
  averageKg: number,
  measurementCount = 3,
): WeeklyBodyWeightResponse {
  return {
    year,
    week: weekNumber,
    from,
    to,
    measurementCount,
    averageKg,
    incomplete: measurementCount < 2,
    deltaKg: null,
    deltaPercent: null,
  };
}

describe("dayToTime", () => {
  it("bierze południe, nie północ", () => {
    // Północ leży na granicy doby i przy zmianie czasu potrafi wylądować
    // w dniu poprzednim — punkt przeskoczyłby o kratkę bez powodu w danych.
    const t = dayToTime("2026-03-29");
    expect(new Date(t).getHours()).toBe(12);
    expect(new Date(t).getDate()).toBe(29);
  });

  it("zachowuje dzień także w noc zmiany czasu (ostatnia niedziela marca)", () => {
    for (const day of ["2026-03-28", "2026-03-29", "2026-03-30"]) {
      expect(new Date(dayToTime(day)).getDate()).toBe(Number(day.slice(-2)));
    }
  });
});

describe("rawPoints", () => {
  it("sortuje chronologicznie niezależnie od kolejności wejścia", () => {
    const points = rawPoints([
      entry("2026-09-03", 80.4),
      entry("2026-09-01", 80.9),
      entry("2026-09-02", 80.6),
    ]);
    expect(points.map((p) => p.measuredOn)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });
});

describe("weeklyPoints", () => {
  it("stawia średnią w ŚRODKU tygodnia, nie na jego początku", () => {
    // Średnia pon-niedz nie opisuje poniedziałku. Postawiona na granicy
    // rozjeżdżałaby się z chmurą pomiarów, przez którą ma przechodzić.
    const [point] = weeklyPoints([week(2026, 36, "2026-08-31", "2026-09-06", 80.5)]);
    const middle = new Date(point.t);
    expect(middle.getDay()).toBe(4); // czwartek
    expect(middle.getDate()).toBe(3);
    expect(middle.getHours()).toBe(12);
  });

  it("sortuje po roku i numerze tygodnia, nie po samym numerze", () => {
    // Bez porównania roku tydzień 1 z 2027 wylądowałby przed tygodniem 52 z 2026.
    const points = weeklyPoints([
      week(2027, 1, "2027-01-04", "2027-01-10", 79),
      week(2026, 52, "2026-12-21", "2026-12-27", 81),
    ]);
    expect(points.map((p) => [p.year, p.week])).toEqual([
      [2026, 52],
      [2027, 1],
    ]);
  });

  it("niesie `incomplete` i liczbę pomiarów -- wykres wyróżnia niepełny tydzień", () => {
    const [point] = weeklyPoints([week(2026, 36, "2026-08-31", "2026-09-06", 80.5, 1)]);
    expect(point.incomplete).toBe(true);
    expect(point.measurementCount).toBe(1);
  });
});

describe("weightDomain", () => {
  it("obejmuje obie serie, nie tylko jedną", () => {
    const domain = weightDomain(rawPoints([entry("2026-09-01", 78)]), [
      { ...weeklyPoints([week(2026, 36, "2026-08-31", "2026-09-06", 84)])[0] },
    ]);
    expect(domain).not.toBeNull();
    expect(domain?.[0]).toBeLessThanOrEqual(78);
    expect(domain?.[1]).toBeGreaterThanOrEqual(84);
  });

  it("stabilna waga dostaje margines minimum pół kilograma", () => {
    // Bez dolnej granicy marginesu waga zmienna o 200 g rysuje się jako
    // płaska kreska przyklejona do krawędzi wykresu.
    const points = rawPoints([entry("2026-09-01", 80.0), entry("2026-09-02", 80.2)]);
    const domain = weightDomain(points, []);
    expect(domain?.[0]).toBeLessThanOrEqual(79.5);
    expect(domain?.[1]).toBeGreaterThanOrEqual(80.7);
  });

  it("brak danych to brak domeny, nie [0, 0]", () => {
    expect(weightDomain([], [])).toBeNull();
  });
});
