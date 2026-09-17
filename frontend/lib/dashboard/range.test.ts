import { describe, expect, it } from "vitest";
import { dashboardDates } from "@/lib/dashboard/range";

describe("dashboardDates", () => {
  it("zamienia momenty odpowiedzi na dni kalendarzowe w Warszawie", () => {
    // `2026-03-15T23:00:00Z` to już 16 marca w Warszawie (poniedziałek),
    // a `to` wskazuje POCZĄTEK jutra, więc ostatnim dniem zakresu jest 17.09.
    const dates = dashboardDates("2026-03-15T23:00:00Z", "2026-09-17T22:00:00Z");
    expect(dates.from).toBe("2026-03-16");
    expect(dates.to).toBe("2026-09-17");
  });

  it("cofa początek do poniedziałku tygodnia ISO", () => {
    // 2026-09-17 to czwartek.
    const dates = dashboardDates("2026-09-16T22:00:00Z", "2026-09-17T22:00:00Z");
    expect(dates.from).toBe("2026-09-14");
  });
});
