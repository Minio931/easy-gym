import { describe, expect, it } from "vitest";
import { buildCalendar, cellIntensity } from "@/lib/dashboard/calendar";

describe("buildCalendar", () => {
  it("każdy tydzień ma 7 komórek i zaczyna się w poniedziałek", () => {
    // 2026-09-17 to czwartek; siatka musi cofnąć się do poniedziałku 14.09.
    const grid = buildCalendar([], "2026-09-17", "2026-09-20");
    expect(grid.weeks).toHaveLength(1);
    expect(grid.weeks[0]).toHaveLength(7);
    expect(grid.weeks[0][0].date).toBe("2026-09-14");
  });

  it("niedziela należy do TEGO tygodnia, nie do następnego", () => {
    // `getDay()` daje 0 dla niedzieli — bez korekty niedziela otwierałaby
    // kolejny tydzień, a tydzień w tym projekcie jest ISO (pon-niedz).
    const grid = buildCalendar([], "2026-09-20", "2026-09-20"); // niedziela
    expect(grid.weeks[0][0].date).toBe("2026-09-14");
    expect(grid.weeks[0][6].date).toBe("2026-09-20");
  });

  it("dni przed początkiem zakresu są oznaczone jako poza nim", () => {
    const grid = buildCalendar([], "2026-09-17", "2026-09-20");
    // Poniedziałek-środa dopełniają tydzień, ale nie należą do zakresu.
    expect(grid.weeks[0].slice(0, 3).every((cell) => cell.outside)).toBe(true);
    expect(grid.weeks[0][3].outside).toBe(false); // czwartek 17.09
  });

  it("wpisuje liczbę treningów w odpowiedni dzień", () => {
    const grid = buildCalendar(
      [
        { date: "2026-09-15", workoutCount: 1 },
        { date: "2026-09-17", workoutCount: 2 },
      ],
      "2026-09-14",
      "2026-09-20",
    );
    expect(grid.weeks[0][1].workoutCount).toBe(1); // wtorek
    expect(grid.weeks[0][3].workoutCount).toBe(2); // czwartek
    expect(grid.maxCount).toBe(2);
  });

  it("obejmuje przełom roku bez gubienia tygodnia", () => {
    const grid = buildCalendar([], "2026-12-28", "2027-01-10");
    const all = grid.weeks.flat().map((cell) => cell.date);
    expect(all).toContain("2026-12-31");
    expect(all).toContain("2027-01-01");
    expect(grid.weeks).toHaveLength(2);
  });

  it("podpisuje kolumny nazwą miesiąca, gdy ten się zmienia", () => {
    const grid = buildCalendar([], "2026-08-24", "2026-09-20");
    expect(grid.monthLabels.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildCalendar — zmiana czasu", () => {
  it("ostatni dzień zakresu przechodzącego przez zmianę czasu NIE wypada poza zakres", () => {
    // Regresja: kursor szedł po sztywnych 24 h, więc po 29 marca (przejście na
    // czas letni) przesuwał się z południa na 13:00 i porównanie z końcem
    // zakresu wyrzucało ostatni dzień. Na pulpicie znikał dzisiejszy dzień
    // razem z treningami, które się na nim odbyły.
    const grid = buildCalendar(
      [{ date: "2026-09-17", workoutCount: 11 }],
      "2026-03-16",
      "2026-09-17",
    );
    const dzisiaj = grid.weeks.flat().find((cell) => cell.date === "2026-09-17");

    expect(dzisiaj).toBeDefined();
    expect(dzisiaj?.outside).toBe(false);
    expect(dzisiaj?.workoutCount).toBe(11);
    expect(grid.maxCount).toBe(11);
  });

  it("dni po końcu zakresu zostają poza nim", () => {
    const grid = buildCalendar([], "2026-03-16", "2026-09-17");
    const jutro = grid.weeks.flat().find((cell) => cell.date === "2026-09-18");
    expect(jutro?.outside).toBe(true);
  });

  it("jesienna zmiana czasu też nie gubi dnia", () => {
    // 25 października 2026 — przejście z powrotem na czas zimowy.
    const grid = buildCalendar(
      [{ date: "2026-11-02", workoutCount: 2 }],
      "2026-10-05",
      "2026-11-02",
    );
    const ostatni = grid.weeks.flat().find((cell) => cell.date === "2026-11-02");
    expect(ostatni?.outside).toBe(false);
    expect(ostatni?.workoutCount).toBe(2);
  });
});

describe("cellIntensity", () => {
  it("zero treningów to zero wypełnienia", () => {
    expect(cellIntensity(0, 3)).toBe(0);
  });

  it("skaluje do maksimum, więc jeden trening dziennie też daje czytelną siatkę", () => {
    // Przy sztywnym progu ktoś trenujący raz dziennie miałby wszystko blade.
    expect(cellIntensity(1, 1)).toBe(1);
    expect(cellIntensity(1, 3)).toBeGreaterThan(0);
    expect(cellIntensity(1, 3)).toBeLessThan(1);
  });

  it("nigdy nie przekracza jedynki", () => {
    expect(cellIntensity(10, 1)).toBe(1);
  });

  it("brak danych nie wywraca skalowania", () => {
    expect(cellIntensity(2, 0)).toBe(0);
  });
});
