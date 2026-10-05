/**
 * A set row draft — what the user has in the fields before tapping ✓. Lives
 * outside `WorkoutDetailResponse`, because the server does not need to know
 * about an unfilled set; only the confirmation reaches the database.
 *
 * At most one draft per exercise (key = `workoutExerciseId`).
 */
export interface SetDraft {
  /** UUID assigned up front — after confirmation becomes the set's `id` in the database. */
  id: string;
  workoutExerciseId: string;
  /** Raw text from the input, not a number: empty ≠ 0, and "102," is a transient state. */
  weight: string;
  reps: string;
  rpe: number | null;
  isWarmup: boolean;
  toFailure: boolean;
  assisted: boolean;
  /** `true` when the draft is editing an already-saved set (✓ then does an upsert). */
  editing: boolean;
  /** The user pressed ✓ on an empty field — only then do we show the message. */
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
 * Whether the draft is untouched — the user has not touched it yet.
 *
 * Only such a draft may be swapped by a suggestion. A typed-in weight, a set
 * marker or editing a saved set is a user decision, and the suggestion has
 * no right to overwrite it, even if it arrives a second later (the exercise
 * history is fetched asynchronously).
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
 * Weight suggestion from the previous workout (PROMPT §3 — reference point).
 *
 * We fill in ONLY the weight. Weight is a fact: the bar is loaded before
 * the set starts, so the suggestion saves typing. Reps are the RESULT of
 * the set — pre-filling them would mean one inattentive ✓ saves a number
 * nobody performed.
 */
export function withSuggestedWeight(draft: SetDraft, weightKg: number): SetDraft {
  if (!isUntouchedDraft(draft)) {
    return draft;
  }
  return { ...draft, weight: String(weightKg) };
}
