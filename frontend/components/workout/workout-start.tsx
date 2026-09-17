"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionLabel } from "@/components/ui/screen";
import { isAbortError } from "@/lib/api/errors";
import { listRoutines } from "@/lib/api/routines";
import { pluralPl } from "@/lib/format";
import { startEmptyWorkout, startWorkoutFromRoutine } from "@/lib/workout/store";
import type { RoutineResponse } from "@/types/api";

/**
 * Stan pusty ekranu treningu: jeden przycisk główny i lista szablonów jako
 * wiersze. Tap w szablon od razu startuje trening (`applyRoutine`), bez
 * ekranu podglądu — szablon to skrót, a nie formularz.
 */
export function WorkoutStart() {
  const [routines, setRoutines] = useState<RoutineResponse[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void listRoutines(controller.signal)
      .then(setRoutines)
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setRoutines([]);
        }
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <>
      <SectionLabel>Aktywny trening</SectionLabel>
      <EmptyState
        message="Nie masz otwartego treningu. Zacznij od pustego albo wybierz szablon."
        action={
          <Button fullWidth onClick={startEmptyWorkout}>
            Rozpocznij trening
          </Button>
        }
      />

      <div className="mt-8">
        <SectionLabel>Rozpocznij z szablonu</SectionLabel>
        {routines === null ? null : routines.length === 0 ? (
          <p className="meta">Nie masz jeszcze szablonów.</p>
        ) : (
          <ul className="rounded-card border border-hairline bg-surface">
            {routines.map((routine, index) => (
              <li key={routine.id} className={index === 0 ? "" : "border-t border-hairline"}>
                <button
                  type="button"
                  onClick={() => {
                    startWorkoutFromRoutine(routine);
                  }}
                  className="flex h-14 w-full flex-col justify-center px-4 text-left active:bg-surface-2"
                >
                  <span className="truncate text-ink">{routine.name}</span>
                  <span className="meta">
                    {routine.items.length}{" "}
                    {pluralPl(routine.items.length, "ćwiczenie", "ćwiczenia", "ćwiczeń")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
