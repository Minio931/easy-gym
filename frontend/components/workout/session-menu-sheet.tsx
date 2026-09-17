"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import type { WorkoutDetailResponse } from "@/types/api";

/**
 * Menu sesji (⋮ w górnym pasku). Tu siedzą akcje rzadkie i nieodwracalne:
 * notatka, deload, zakończenie i porzucenie treningu. `Zakończ trening`
 * dubluje się tu z przyciskiem na końcu listy — świadomie, bo tamten leży
 * poza zasięgiem kciuka i trzeba do niego doscrollować.
 */
export function SessionMenuSheet({
  workout,
  onClose,
  onNotesChange,
  onDeloadChange,
  onFinish,
  onDiscard,
}: {
  workout: WorkoutDetailResponse;
  onClose: () => void;
  onNotesChange: (notes: string) => void;
  onDeloadChange: (isDeload: boolean) => void;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  const [notes, setNotes] = useState(workout.notes ?? "");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  return (
    <Sheet title="Opcje treningu" onClose={onClose}>
      <div className="overflow-y-auto px-4 pt-4 pb-6">
        <h2 className="screen-title">Aktywny trening</h2>

        <label htmlFor="notatka-treningu" className="label-caps mt-6 mb-2 block">
          Notatka do treningu
        </label>
        <textarea
          id="notatka-treningu"
          rows={3}
          className="w-full rounded-control border border-hairline bg-surface-2 p-3 text-ink"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
          onBlur={() => {
            if (notes !== (workout.notes ?? "")) {
              onNotesChange(notes);
            }
          }}
        />

        <div className="mt-4 border-t border-hairline pt-2">
          <Toggle
            label="Deload"
            description="Tydzień odciążenia — trening nie wchodzi do trendu objętości."
            checked={workout.isDeload}
            onChange={onDeloadChange}
          />
        </div>

        <div className="mt-6 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              onFinish();
            }}
            className="h-control w-full rounded-control border border-hairline bg-surface-2 font-semibold text-ink"
          >
            Zakończ trening
          </button>
        </div>

        <div className="mt-4">
          {confirmDiscard ? (
            <>
              <p className="text-ink-2">Porzucić trening? Zapisane serie znikną.</p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDiscard(false);
                  }}
                  className="h-control flex-1 rounded-control border border-hairline font-semibold text-ink-2"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDiscard();
                    onClose();
                  }}
                  className="h-control flex-1 rounded-control border border-hairline bg-surface-2 font-semibold"
                  style={{ color: "var(--critical)" }}
                >
                  Porzuć
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirmDiscard(true);
              }}
              className="h-control w-full rounded-control text-left font-semibold"
              style={{ color: "var(--critical)" }}
            >
              Porzuć trening
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
