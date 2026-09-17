"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Screen, Skeleton } from "@/components/ui/screen";
import { ExerciseCard } from "@/components/workout/exercise-card";
import { ExerciseMenuSheet } from "@/components/workout/exercise-menu-sheet";
import { ExercisePickerSheet } from "@/components/workout/exercise-picker-sheet";
import { FinishSheet } from "@/components/workout/finish-sheet";
import { SessionContextBar } from "@/components/workout/session-context-bar";
import { WorkoutStart } from "@/components/workout/workout-start";
import { useSettings } from "@/lib/settings";
import { useElapsedSeconds } from "@/lib/use-now";
import { restSecondsFor, useRestPreferences } from "@/lib/workout/rest-preferences";
import { startRest } from "@/lib/workout/rest-timer";
import { unlockAudio } from "@/lib/workout/rest-signals";
import {
  addExerciseToWorkout,
  beginNewSet,
  closeFinishSheet,
  confirmDraft,
  deleteSet,
  editSet,
  ensureActiveWorkoutLoaded,
  finishActiveWorkout,
  openFinishSheet,
  removeExerciseFromWorkout,
  setActiveExercise,
  setDeload,
  setExerciseNotes,
  updateDraft,
  useWorkoutState,
} from "@/lib/workout/store";
import type { ExerciseResponse, SetResponse } from "@/types/api";

/**
 * Ekran aktywnego treningu. Orkiestruje; liczenia nie robi (to `lib/metrics.ts`),
 * zapisów nie robi (to `lib/workout/store.ts`). Tu jest wyłącznie to, czego
 * magazyn nie powinien wiedzieć: ustawienia urządzenia (czas przerwy, dźwięk),
 * nawigacja i który arkusz jest otwarty.
 */
export function WorkoutScreen() {
  const state = useWorkoutState();
  const { settings } = useSettings();
  const preferences = useRestPreferences();
  const router = useRouter();
  const elapsedSeconds = useElapsedSeconds(state.workout?.startedAt ?? null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuExerciseId, setMenuExerciseId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    ensureActiveWorkoutLoaded(settings.oneRepMaxFormula);
  }, [settings.oneRepMaxFormula]);

  const workout = state.workout;

  if (state.status === "loading") {
    return (
      <Screen>
        <Skeleton className="mb-3 h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </Screen>
    );
  }

  if (workout === null) {
    return (
      <Screen>
        <WorkoutStart />
      </Screen>
    );
  }

  /** Zatwierdzenie serii: zapis, a zaraz po nim automatyczny start przerwy. */
  const confirm = (workoutExerciseId: string) => {
    unlockAudio();
    const result = confirmDraft(workoutExerciseId, settings.oneRepMaxFormula);
    if (result === null) {
      return;
    }
    startRest({
      seconds: restSecondsFor(
        preferences,
        result.exerciseId,
        settings.defaultRestSeconds,
        result.set.isWarmup,
      ),
      workoutExerciseId,
      soundEnabled: preferences.soundEnabled,
    });
  };

  /** Jeden tap = seria odhaczona i timer w biegu. Ścieżka dla 5×5. */
  const copyPrevious = (workoutExerciseId: string, last: SetResponse) => {
    beginNewSet(workoutExerciseId, {
      weight: String(last.weightKg),
      reps: String(last.reps),
      isWarmup: last.isWarmup,
    });
    confirm(workoutExerciseId);
  };

  const pickExercise = (exercise: ExerciseResponse) => {
    setPickerOpen(false);
    const workoutExerciseId = addExerciseToWorkout(exercise, settings.oneRepMaxFormula);
    if (workoutExerciseId === null) {
      return;
    }
    requestAnimationFrame(() => {
      document
        .getElementById(`cwiczenie-${workoutExerciseId}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const finish = () => {
    setFinishing(true);
    void finishActiveWorkout().then((detail) => {
      setFinishing(false);
      closeFinishSheet();
      if (detail !== null) {
        // replace, nie push: cofnięcie nie może wrócić do sesji, której już nie ma.
        router.replace(`/trening/${detail.id}/podsumowanie`);
      }
    });
  };

  const unconfirmedCount = Object.values(state.drafts).filter(
    (draft) => !draft.editing && draft.weight !== "" && draft.reps !== "",
  ).length;

  const menuExercise = workout.exercises.find((exercise) => exercise.id === menuExerciseId);

  return (
    <Screen>
      <SessionContextBar
        isDeload={workout.isDeload}
        routineName={state.routineName}
        startedAt={workout.startedAt}
        elapsedSeconds={elapsedSeconds}
      />

      {workout.exercises.length === 0 ? (
        <p className="meta py-6 text-center">Pusty trening. Dodaj pierwsze ćwiczenie.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {workout.exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              draft={state.drafts[exercise.id]}
              isActive={state.activeExerciseId === exercise.id}
              reference={state.references[exercise.exerciseId]}
              records={workout.personalRecordsBrokenIn}
              targetSets={state.routineTargets[exercise.exerciseId]}
              onOpenMenu={() => {
                setMenuExerciseId(exercise.id);
              }}
              onDraftChange={(patch) => {
                updateDraft(exercise.id, patch);
              }}
              onConfirm={() => {
                confirm(exercise.id);
              }}
              onActivateDraft={() => {
                setActiveExercise(exercise.id);
              }}
              onEditSet={(set) => {
                editSet(exercise.id, set);
              }}
              onDeleteSet={(set) => {
                deleteSet(exercise.id, set.id);
              }}
              onAddSet={() => {
                const last = exercise.sets.at(-1);
                beginNewSet(
                  exercise.id,
                  last === undefined
                    ? undefined
                    : { weight: String(last.weightKg), reps: String(last.reps) },
                );
              }}
              onCopyPrevious={() => {
                const last = exercise.sets.at(-1);
                if (last !== undefined) {
                  copyPrevious(exercise.id, last);
                }
              }}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setPickerOpen(true);
        }}
        className="mt-3 h-control w-full rounded-control border border-hairline font-semibold text-ink active:bg-surface-2"
      >
        + Dodaj ćwiczenie
      </button>

      {/* Świadomie NIE jest sticky i leży na końcu scrolla — poza zasięgiem
          kciuka zajętego seriami. Dubluje się w ⋮ sesji. */}
      <button
        type="button"
        onClick={openFinishSheet}
        className="mt-8 h-control w-full rounded-control border border-hairline bg-surface-2 font-semibold text-ink active:bg-surface-3"
      >
        Zakończ trening
      </button>

      {pickerOpen && (
        <ExercisePickerSheet
          onPick={pickExercise}
          onClose={() => {
            setPickerOpen(false);
          }}
        />
      )}

      {menuExercise !== undefined && (
        <ExerciseMenuSheet
          exercise={menuExercise}
          onClose={() => {
            setMenuExerciseId(null);
          }}
          onDelete={() => {
            removeExerciseFromWorkout(menuExercise.id);
          }}
          onNotesChange={(notes) => {
            setExerciseNotes(menuExercise.id, notes);
          }}
        />
      )}

      {state.finishSheetOpen && (
        <FinishSheet
          workout={workout}
          elapsedSeconds={elapsedSeconds}
          unconfirmedCount={unconfirmedCount}
          busy={finishing}
          onDeloadChange={setDeload}
          onConfirm={finish}
          onClose={closeFinishSheet}
        />
      )}
    </Screen>
  );
}
