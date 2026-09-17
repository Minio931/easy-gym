import { describe, expect, it } from "vitest";
import { isRecordSet, markersText, referenceSet, referenceText } from "@/lib/workout/reference";
import type { ExerciseReference } from "@/lib/workout/store";

const ready = (sets: { weightKg: number; reps: number }[]): ExerciseReference => ({
  status: "ready",
  sets,
});

describe("referenceSet", () => {
  it("dopasowuje po numerze serii", () => {
    const reference = ready([
      { weightKg: 100, reps: 5 },
      { weightKg: 105, reps: 3 },
    ]);
    expect(referenceSet(reference, 0)).toEqual({ weightKg: 100, reps: 5 });
    expect(referenceSet(reference, 1)).toEqual({ weightKg: 105, reps: 3 });
  });

  it("gdy poprzednio było mniej serii, pokazuje ostatnią z nich", () => {
    expect(referenceSet(ready([{ weightKg: 100, reps: 5 }]), 4)).toEqual({ weightKg: 100, reps: 5 });
  });

  it("bez historii nie ma referencji", () => {
    expect(referenceSet(ready([]), 0)).toBeNull();
    expect(referenceSet(undefined, 0)).toBeNull();
  });
});

describe("referenceText", () => {
  it("w trakcie ładowania jest pusty (miejsce zarezerwowane, zero skoku layoutu)", () => {
    expect(referenceText({ status: "loading", sets: [] }, 0)).toBe("");
    expect(referenceText(undefined, 0)).toBe("");
  });

  it("bez historii mówi 'pierwszy raz', nie zostawia pustki", () => {
    expect(referenceText(ready([]), 0)).toBe("pierwszy raz");
  });

  it("formatuje odniesienie bez zer na końcu", () => {
    expect(referenceText(ready([{ weightKg: 102.5, reps: 5 }]), 0)).toBe("ostatnio: 102.5 × 5");
    expect(referenceText(ready([{ weightKg: 100, reps: 5 }]), 0)).toBe("ostatnio: 100 × 5");
  });
});

describe("markersText", () => {
  it("skleja znaczniki tekstem, nie kolorem", () => {
    expect(markersText({ rpe: 8, toFailure: true, assisted: true })).toBe(
      "RPE 8 · do upadku · z asystą",
    );
    expect(markersText({ rpe: null, toFailure: false, assisted: false })).toBe("");
  });
});

describe("isRecordSet", () => {
  it("dopasowuje po setId i ignoruje rekordy sesyjne (setId: null)", () => {
    const records = [{ setId: "s-1" }, { setId: null }];
    expect(isRecordSet({ id: "s-1" }, records)).toBe(true);
    expect(isRecordSet({ id: "s-2" }, records)).toBe(false);
  });
});
