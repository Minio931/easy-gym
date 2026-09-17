import { describe, expect, it } from "vitest";
import { emptyDraft, isUntouchedDraft, withSuggestedWeight } from "@/lib/workout/draft";

describe("isUntouchedDraft", () => {
  it("świeży szkic jest nietknięty", () => {
    expect(isUntouchedDraft(emptyDraft("d1", "we1"))).toBe(true);
  });

  it("wpisany ciężar albo powtórzenia kończą nietkniętość", () => {
    const draft = emptyDraft("d1", "we1");
    expect(isUntouchedDraft({ ...draft, weight: "100" })).toBe(false);
    expect(isUntouchedDraft({ ...draft, reps: "5" })).toBe(false);
  });

  it("znacznik też się liczy jako dotknięcie", () => {
    const draft = emptyDraft("d1", "we1");
    // Ktoś oznaczył wiersz jako rozgrzewkę i dopiero szuka ciężaru —
    // podpowiedź z serii roboczej wstawiłaby tam za dużo.
    expect(isUntouchedDraft({ ...draft, isWarmup: true })).toBe(false);
    expect(isUntouchedDraft({ ...draft, rpe: 8 })).toBe(false);
    expect(isUntouchedDraft({ ...draft, toFailure: true })).toBe(false);
    expect(isUntouchedDraft({ ...draft, assisted: true })).toBe(false);
  });

  it("edycja zapisanej serii nigdy nie jest nietknięta", () => {
    const draft = { ...emptyDraft("d1", "we1"), editing: true };
    expect(isUntouchedDraft(draft)).toBe(false);
  });
});

describe("withSuggestedWeight", () => {
  it("wstawia ciężar i NIE rusza powtórzeń", () => {
    const draft = withSuggestedWeight(emptyDraft("d1", "we1"), 102.5);
    expect(draft.weight).toBe("102.5");
    // Powtórzenia są wynikiem serii — jedno nieuważne ✓ zapisałoby liczbę,
    // której nikt nie wykonał.
    expect(draft.reps).toBe("");
  });

  it("nie nadpisuje tego, co user już wpisał", () => {
    // Historia ćwiczenia leci asynchronicznie i potrafi wrócić PO tym, jak
    // ktoś zdążył wpisać swój ciężar.
    const typed = { ...emptyDraft("d1", "we1"), weight: "95" };
    expect(withSuggestedWeight(typed, 102.5)).toBe(typed);
  });

  it("nie rusza szkicu edytującego zapisaną serię", () => {
    const editing = { ...emptyDraft("d1", "we1"), editing: true };
    expect(withSuggestedWeight(editing, 102.5)).toBe(editing);
  });

  it("ciężar bez części dziesiętnej idzie bez zera na końcu", () => {
    expect(withSuggestedWeight(emptyDraft("d1", "we1"), 100).weight).toBe("100");
  });
});
