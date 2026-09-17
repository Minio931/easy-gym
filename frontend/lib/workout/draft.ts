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
