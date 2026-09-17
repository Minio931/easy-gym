import { describe, expect, it } from "vitest";
import {
  EMPTY_ERROR,
  REPS_ERROR,
  WEIGHT_ERROR,
  clampReps,
  clampWeight,
  formatWeightValue,
  parseDecimalInput,
  roundToGrain,
  stepReps,
  stepWeight,
  validateSetInput,
} from "@/lib/workout/set-values";

describe("parseDecimalInput", () => {
  it("przyjmuje przecinek na równi z kropką (polska klawiatura numeryczna)", () => {
    expect(parseDecimalInput("102,5")).toBe(102.5);
    expect(parseDecimalInput("102.5")).toBe(102.5);
  });

  it("pusty input to null, nie zero -- pusty ≠ 0 kg", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("   ")).toBeNull();
  });

  it("odrzuca śmieci zamiast zwracać NaN", () => {
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("10kg")).toBeNull();
    expect(parseDecimalInput("-5")).toBeNull();
  });

  it("toleruje stan przejściowy w trakcie pisania", () => {
    expect(parseDecimalInput("102.")).toBe(102);
    expect(parseDecimalInput(".5")).toBe(0.5);
  });
});

describe("roundToGrain", () => {
  it("zaokrągla do 0.25 kg", () => {
    expect(roundToGrain(102.6)).toBe(102.5);
    expect(roundToGrain(102.63)).toBe(102.75);
    expect(roundToGrain(100)).toBe(100);
  });

  it("nie zostawia pyłu zmiennoprzecinkowego (fałszywy PR przy porównaniu)", () => {
    expect(roundToGrain(102.5000001)).toBe(102.5);
    expect(String(roundToGrain(0.1 + 0.2))).toBe("0.25");
  });
});

describe("clamp", () => {
  it("trzyma granice CHECK-ów bazy", () => {
    expect(clampWeight(600)).toBe(500);
    expect(clampWeight(-10)).toBe(0);
    expect(clampReps(200)).toBe(100);
    expect(clampReps(0)).toBe(1);
  });
});

describe("steppery", () => {
  it("nie wychodzą poza zakres, nawet przy autorepeacie", () => {
    expect(stepWeight("499", 2.5, null)).toBe("500");
    expect(stepWeight("500", 2.5, null)).toBe("500");
    expect(stepWeight("1", -2.5, null)).toBe("0");
    expect(stepReps("100", 1, null)).toBe("100");
    expect(stepReps("1", -1, null)).toBe("1");
  });

  it("z pustego pola startują od wartości referencyjnej, nie od zera", () => {
    expect(stepWeight("", 2.5, 100)).toBe("102.5");
    expect(stepReps("", -1, 5)).toBe("4");
  });

  it("bez referencji pusty plus zaczyna od zera", () => {
    expect(stepWeight("", 2.5, null)).toBe("2.5");
  });
});

describe("formatWeightValue", () => {
  it("nie zostawia zer na końcu", () => {
    expect(formatWeightValue(100)).toBe("100");
    expect(formatWeightValue(102.5)).toBe("102.5");
    expect(formatWeightValue(102.25)).toBe("102.25");
  });
});

describe("validateSetInput", () => {
  it("poprawna seria daje wartości i brak komunikatu", () => {
    const result = validateSetInput("102,5", "5", 8);
    expect(result.values).toEqual({ weightKg: 102.5, reps: 5, rpe: 8 });
    expect(result.message).toBeNull();
  });

  it("ciężar poza zakresem blokuje zapis i nazywa błąd", () => {
    const result = validateSetInput("501", "5", null);
    expect(result.values).toBeNull();
    expect(result.weightError).toBe(WEIGHT_ERROR);
    expect(result.incomplete).toBe(false);
  });

  it("powtórzenia poza zakresem i ułamkowe są odrzucane", () => {
    expect(validateSetInput("100", "101", null).repsError).toBe(REPS_ERROR);
    expect(validateSetInput("100", "5.5", null).repsError).toBe(REPS_ERROR);
  });

  it("puste pola to `incomplete`, nie błąd -- komunikat dopiero przy ✓", () => {
    const result = validateSetInput("", "", null);
    expect(result.values).toBeNull();
    expect(result.incomplete).toBe(true);
    expect(result.message).toBe(EMPTY_ERROR);
    expect(result.weightError).toBeNull();
  });

  it("zaokrągla ciężar do 0.25 kg dopiero przy zatwierdzeniu", () => {
    expect(validateSetInput("102.6", "5", null).values?.weightKg).toBe(102.5);
  });

  it("zero kilogramów jest poprawne (ćwiczenia z masą własną)", () => {
    expect(validateSetInput("0", "12", null).values).toEqual({ weightKg: 0, reps: 12, rpe: null });
  });

  it("RPE poza 1-10 jest odrzucane", () => {
    expect(validateSetInput("100", "5", 11).values).toBeNull();
  });
});
