import { describe, expect, it } from "vitest";
import {
  BODY_WEIGHT_EMPTY_ERROR,
  BODY_WEIGHT_ERROR,
  todayIsoDate,
  validateBodyWeightInput,
} from "@/lib/bodyweight/input";

describe("validateBodyWeightInput", () => {
  it("przyjmuje przecinek jako separator dziesiętny", () => {
    // Na polskiej klawiaturze przecinek jest pod kciukiem, kropka nie.
    expect(validateBodyWeightInput("80,4")).toEqual({ weightKg: 80.4, error: null });
    expect(validateBodyWeightInput("80.4")).toEqual({ weightKg: 80.4, error: null });
  });

  it("zaokrągla do dwóch miejsc, jak kolumna numeric(6,2) w bazie", () => {
    expect(validateBodyWeightInput("80,456").weightKg).toBe(80.46);
  });

  it("granice są OSTRE po obu stronach -- tak jak CHECK w bazie", () => {
    // Dopuszczenie 0 albo 400 dałoby 400 z serwera zamiast komunikatu na ekranie.
    expect(validateBodyWeightInput("0").error).toBe(BODY_WEIGHT_ERROR);
    expect(validateBodyWeightInput("400").error).toBe(BODY_WEIGHT_ERROR);
    expect(validateBodyWeightInput("0.1").error).toBeNull();
    expect(validateBodyWeightInput("399.9").error).toBeNull();
  });

  it("puste pole mówi 'podaj wagę', nie 'waga poza zakresem'", () => {
    expect(validateBodyWeightInput("").error).toBe(BODY_WEIGHT_EMPTY_ERROR);
    expect(validateBodyWeightInput("   ").error).toBe(BODY_WEIGHT_EMPTY_ERROR);
  });

  it("tekst nie przechodzi", () => {
    expect(validateBodyWeightInput("osiemdziesiąt").error).toBe(BODY_WEIGHT_ERROR);
  });
});

describe("todayIsoDate", () => {
  it("bierze dzień lokalny, nie UTC", () => {
    // 23:30 czasu lokalnego to wciąż dziś, choć w UTC bywa już jutro —
    // waga wpisana wieczorem musi trafić na właściwy dzień.
    const late = new Date(2026, 8, 17, 23, 30);
    expect(todayIsoDate(late)).toBe("2026-09-17");
  });

  it("dopełnia zerami", () => {
    expect(todayIsoDate(new Date(2026, 0, 5, 8))).toBe("2026-01-05");
  });
});
