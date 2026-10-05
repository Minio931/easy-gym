"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import type { WorkoutDetailResponse } from "@/types/api";

/**
 * Session menu (⋮ in the top bar). Rare and irreversible actions live
 * here: note, deload, finish, and discard the workout. `Zakończ trening`
 * doubles with the button at the end of the list — deliberately, because
 * that one is out of thumb reach and requires scrolling.
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
