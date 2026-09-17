/**
 * Szkic wiersza serii — to, co user ma w polach, zanim dotknie ✓. Żyje poza
 * `WorkoutDetailResponse`, bo serwer o niewypełnionej serii nie musi nic
 * wiedzieć; do bazy trafia dopiero zatwierdzenie.
 *
 * Na jedno ćwiczenie przypada najwyżej jeden szkic (klucz = `workoutExerciseId`).
 */
export interface SetDraft {
  /** UUID nadany od razu — po zatwierdzeniu staje się `id` serii w bazie. */
  id: string;
  workoutExerciseId: string;
  /** Surowy tekst z inputa, nie liczba: pusty ≠ 0, a „102," to stan przejściowy. */
  weight: string;
  reps: string;
  rpe: number | null;
  isWarmup: boolean;
  toFailure: boolean;
  assisted: boolean;
  /** `true` gdy szkic edytuje serię już zapisaną (✓ robi wtedy upsert). */
  editing: boolean;
  /** User nacisnął ✓ przy pustym polu — dopiero wtedy pokazujemy komunikat. */
  submitAttempted: boolean;
}

export function emptyDraft(id: string, workoutExerciseId: string): SetDraft {
  return {
    id,
    workoutExerciseId,
    weight: "",
    reps: "",
    rpe: null,
    isWarmup: false,
    toFailure: false,
    assisted: false,
    editing: false,
    submitAttempted: false,
  };
}

/**
 * Czy szkic jest nietknięty — user go jeszcze nie dotknął.
 *
 * Tylko taki wolno podmienić podpowiedzią. Wpisany ciężar, ustawiony znacznik
 * albo edycja zapisanej serii to decyzja użytkownika i podpowiedź nie ma prawa
 * jej nadpisać, choćby przyszła sekundę później (historia ćwiczenia leci
 * asynchronicznie).
 */
export function isUntouchedDraft(draft: SetDraft): boolean {
  return (
    !draft.editing &&
    draft.weight === "" &&
    draft.reps === "" &&
    draft.rpe === null &&
    !draft.isWarmup &&
    !draft.toFailure &&
    !draft.assisted
  );
}

/**
 * Podpowiedź ciężaru z ostatniego treningu (PROMPT §3 — punkt odniesienia).
 *
 * Wypełniamy WYŁĄCZNIE ciężar. Ciężar jest faktem: sztanga jest załadowana,
 * zanim seria się zacznie, więc podpowiedź oszczędza wpisywanie. Powtórzenia
 * są WYNIKIEM serii — wstawienie ich z góry sprawiłoby, że jedno nieuważne ✓
 * zapisuje liczbę, której nikt nie wykonał.
 */
export function withSuggestedWeight(draft: SetDraft, weightKg: number): SetDraft {
  if (!isUntouchedDraft(draft)) {
    return draft;
  }
  return { ...draft, weight: String(weightKg) };
}
