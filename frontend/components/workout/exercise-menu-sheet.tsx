"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Pill } from "@/components/ui/pill";
import { Toggle } from "@/components/ui/toggle";
import { formatDuration, setsLabel } from "@/lib/format";
import {
  REST_PRESETS,
  setRestSecondsFor,
  setRestSoundEnabled,
  useRestPreferences,
} from "@/lib/workout/rest-preferences";
import { useSettings } from "@/lib/settings";
import type { WorkoutExerciseResponse } from "@/types/api";

/**
 * Menu ćwiczenia (⋮). Akcje rzadkie i nieodwracalne — dlatego siedzą u góry
 * karty, poza zasięgiem kciuka zajętego seriami, i dlatego usunięcie ćwiczenia
 * wymaga potwierdzenia, a usunięcie serii nie (tam jest „Cofnij").
 */
export function ExerciseMenuSheet({
  exercise,
  onClose,
  onDelete,
  onNotesChange,
}: {
  exercise: WorkoutExerciseResponse;
  onClose: () => void;
  onDelete: () => void;
  onNotesChange: (notes: string) => void;
}) {
  const preferences = useRestPreferences();
  const { settings } = useSettings();
  const [notes, setNotes] = useState(exercise.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const restSeconds = preferences.perExercise[exercise.exerciseId] ?? settings.defaultRestSeconds;

  return (
    <Sheet title={exercise.exerciseName} onClose={onClose}>
      <div className="overflow-y-auto px-4 pt-4 pb-6">
        <h2 className="screen-title truncate">{exercise.exerciseName}</h2>

        <label htmlFor="notatka-cwiczenia" className="label-caps mt-6 mb-2 block">
          Notatka
        </label>
        <textarea
          id="notatka-cwiczenia"
          rows={2}
          className="w-full rounded-control border border-hairline bg-surface-2 p-3 text-ink"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
          onBlur={() => {
            if (notes !== (exercise.notes ?? "")) {
              onNotesChange(notes);
            }
          }}
        />

        <h3 className="label-caps mt-6 mb-2">Czas przerwy</h3>
        <div className="chip-row">
          {REST_PRESETS.map((seconds) => (
            <Pill
              key={seconds}
              active={restSeconds === seconds}
              onClick={() => {
                setRestSecondsFor(exercise.exerciseId, seconds);
              }}
            >
              {seconds < 120 ? `${seconds} s` : formatDuration(seconds)}
            </Pill>
          ))}
        </div>

        <div className="mt-4 border-t border-hairline pt-2">
          <Toggle
            label="Dźwięk na koniec przerwy"
            checked={preferences.soundEnabled}
            onChange={setRestSoundEnabled}
          />
        </div>

        <div className="mt-6 border-t border-hairline pt-4">
          {confirmDelete ? (
            <>
              <p className="text-ink-2">
                Usunąć „{exercise.exerciseName}&rdquo; razem z {setsLabel(exercise.sets.length)}?
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(false);
                  }}
                  className="h-control flex-1 rounded-control border border-hairline font-semibold text-ink-2"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    onClose();
                  }}
                  className="h-control flex-1 rounded-control border border-hairline bg-surface-2 font-semibold"
                  style={{ color: "var(--critical)" }}
                >
                  Usuń
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(true);
              }}
              className="h-control w-full rounded-control text-left font-semibold"
              style={{ color: "var(--critical)" }}
            >
              Usuń ćwiczenie
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
