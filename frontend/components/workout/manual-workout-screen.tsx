"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Screen, SectionLabel } from "@/components/ui/screen";
import { ExercisePickerSheet } from "@/components/workout/exercise-picker-sheet";
import { messageForUser } from "@/lib/api/errors";
import { todayIsoDate } from "@/lib/bodyweight/input";
import { submitManualWorkout } from "@/lib/workout/manual-entry";
import { uuid } from "@/lib/workout/uuid";
import { validateSetInput } from "@/lib/workout/set-values";
import type { ExerciseResponse } from "@/types/api";

/**
 * Ręczne wpisanie treningu z przeszłości -- jedyna droga do backfillu
 * historii (patrz `lib/workout/manual-entry.ts`). Świadomie osobno od
 * `WorkoutScreen`: tamten ekran pilnuje inwariantu „najwyżej jeden aktywny
 * trening" i całej maszynerii live session (timer przerwy, drafty,
 * optymistyczne UI) -- tu nic z tego nie ma sensu, bo trening już się odbył.
 */

interface DraftSet {
  id: string;
  weight: string;
  reps: string;
  isWarmup: boolean;
}

interface DraftExercise {
  id: string;
  exercise: ExerciseResponse;
  sets: DraftSet[];
}

function emptySet(): DraftSet {
  return { id: uuid(), weight: "", reps: "", isWarmup: false };
}

export function ManualWorkoutScreen() {
  const router = useRouter();

  const [date, setDate] = useState(() => todayIsoDate());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [isDeload, setIsDeload] = useState(false);
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeOrderValid = `${date}T${startTime}` < `${date}T${endTime}`;
  const hasSets = exercises.some((exercise) => exercise.sets.length > 0);
  const allSetsValid = exercises.every((exercise) =>
    exercise.sets.every(
      (set) => validateSetInput(set.weight, set.reps, null).values !== null,
    ),
  );
  const canSubmit = timeOrderValid && exercises.length > 0 && hasSets && allSetsValid && !submitting;

  const addExercise = (exercise: ExerciseResponse) => {
    setPickerOpen(false);
    setExercises((prev) => [...prev, { id: uuid(), exercise, sets: [emptySet()] }]);
  };

  const removeExercise = (exerciseDraftId: string) => {
    setExercises((prev) => prev.filter((exercise) => exercise.id !== exerciseDraftId));
  };

  const addSet = (exerciseDraftId: string) => {
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === exerciseDraftId
          ? { ...exercise, sets: [...exercise.sets, emptySet()] }
          : exercise,
      ),
    );
  };

  const updateSet = (exerciseDraftId: string, setId: string, patch: Partial<DraftSet>) => {
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === exerciseDraftId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)),
            }
          : exercise,
      ),
    );
  };

  const removeSet = (exerciseDraftId: string, setId: string) => {
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === exerciseDraftId
          ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) }
          : exercise,
      ),
    );
  };

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    void submitManualWorkout({
      startedAt: new Date(`${date}T${startTime}`).toISOString(),
      endedAt: new Date(`${date}T${endTime}`).toISOString(),
      notes: notes.trim() === "" ? null : notes.trim(),
      isDeload,
      exercises: exercises.map((exercise) => ({
        exerciseId: exercise.exercise.id,
        sets: exercise.sets
          .map((set) => validateSetInput(set.weight, set.reps, null).values)
          .filter((values): values is NonNullable<typeof values> => values !== null)
          .map((values, index) => ({
            weightKg: values.weightKg,
            reps: values.reps,
            isWarmup: exercise.sets[index]?.isWarmup ?? false,
          })),
      })),
    })
      .then((workout) => {
        router.replace(`/trening/${workout.id}/podsumowanie`);
      })
      .catch((cause: unknown) => {
        setSubmitting(false);
        setError(
          `${messageForUser(cause)} Część treningu mogła już zostać zapisana -- sprawdź `
          + "historię przed ponowną próbą.",
        );
      });
  };

  return (
    <Screen>
      <SectionLabel>Trening z przeszłości</SectionLabel>
      <p className="meta -mt-2 mb-4">
        Wpisz trening, który już się odbył. Nie liczy się do bieżącej sesji ani serii nauki.
      </p>

      <div className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex gap-2">
          <label className="min-w-0 flex-[2]">
            <span className="label-caps mb-1 block">Dzień</span>
            <input
              type="date"
              value={date}
              max={todayIsoDate()}
              onChange={(event) => {
                setDate(event.target.value);
              }}
              className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="label-caps mb-1 block">Start</span>
            <input
              type="time"
              value={startTime}
              onChange={(event) => {
                setStartTime(event.target.value);
              }}
              className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="label-caps mb-1 block">Koniec</span>
            <input
              type="time"
              value={endTime}
              onChange={(event) => {
                setEndTime(event.target.value);
              }}
              className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
            />
          </label>
        </div>
        {!timeOrderValid && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--critical)" }} role="alert">
            Koniec musi być po starcie.
          </p>
        )}

        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={isDeload}
            onChange={(event) => {
              setIsDeload(event.target.checked);
            }}
          />
          <span className="text-ink">Deload</span>
        </label>

        <label className="mt-4 block">
          <span className="label-caps mb-1 block">Notatki (opcjonalnie)</span>
          <textarea
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
            rows={2}
            className="w-full rounded-control border border-hairline bg-surface-2 px-3 py-2 text-ink"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {exercises.map((exercise) => (
          <ExerciseDraftCard
            key={exercise.id}
            draft={exercise}
            onAddSet={() => {
              addSet(exercise.id);
            }}
            onUpdateSet={(setId, patch) => {
              updateSet(exercise.id, setId, patch);
            }}
            onRemoveSet={(setId) => {
              removeSet(exercise.id, setId);
            }}
            onRemoveExercise={() => {
              removeExercise(exercise.id);
            }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setPickerOpen(true);
        }}
        className="mt-3 h-control w-full rounded-control border border-hairline font-semibold text-ink active:bg-surface-2"
      >
        + Dodaj ćwiczenie
      </button>

      {error !== null && (
        <p className="mt-4 text-[13px]" style={{ color: "var(--critical)" }} role="alert">
          {error}
        </p>
      )}

      <Button fullWidth className="mt-6" disabled={!canSubmit} onClick={submit}>
        {submitting ? "Zapisuję…" : "Zapisz trening"}
      </Button>

      {pickerOpen && (
        <ExercisePickerSheet
          onPick={addExercise}
          onClose={() => {
            setPickerOpen(false);
          }}
        />
      )}
    </Screen>
  );
}

function ExerciseDraftCard({
  draft,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onRemoveExercise,
}: {
  draft: DraftExercise;
  onAddSet: () => void;
  onUpdateSet: (setId: string, patch: Partial<DraftSet>) => void;
  onRemoveSet: (setId: string) => void;
  onRemoveExercise: () => void;
}) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{draft.exercise.name}</p>
          <p className="meta truncate">{draft.exercise.muscleGroup}</p>
        </div>
        <button
          type="button"
          onClick={onRemoveExercise}
          aria-label={`Usuń ${draft.exercise.name} z treningu`}
          className="-mr-2 -mt-1 flex size-touch shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {draft.sets.map((set, index) => {
          const validation = validateSetInput(set.weight, set.reps, null);
          const showError = (set.weight !== "" || set.reps !== "") && validation.message !== null
            && !validation.incomplete;
          return (
            <div key={set.id} className="flex items-center gap-2">
              <span className="num w-5 shrink-0 text-ink-3">{index + 1}</span>
              <input
                inputMode="decimal"
                placeholder="kg"
                value={set.weight}
                onChange={(event) => {
                  onUpdateSet(set.id, { weight: event.target.value });
                }}
                className="h-control min-w-0 flex-1 rounded-control border border-hairline bg-surface-2 px-2 text-right text-ink tabular-nums"
              />
              <input
                inputMode="numeric"
                placeholder="powt."
                value={set.reps}
                onChange={(event) => {
                  onUpdateSet(set.id, { reps: event.target.value });
                }}
                className="h-control min-w-0 flex-1 rounded-control border border-hairline bg-surface-2 px-2 text-right text-ink tabular-nums"
              />
              <label className="flex shrink-0 items-center gap-1 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={set.isWarmup}
                  onChange={(event) => {
                    onUpdateSet(set.id, { isWarmup: event.target.checked });
                  }}
                />
                rozgrz.
              </label>
              <button
                type="button"
                onClick={() => {
                  onRemoveSet(set.id);
                }}
                aria-label={`Usuń serię ${String(index + 1)}`}
                className="flex size-touch shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
              >
                ✕
              </button>
              {showError && (
                <p className="sr-only" role="alert">
                  {validation.message}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAddSet}
        className="mt-2 h-touch w-full rounded-control border border-hairline text-[14px] font-semibold text-ink-2 active:bg-surface-2"
      >
        + Seria
      </button>
    </div>
  );
}
