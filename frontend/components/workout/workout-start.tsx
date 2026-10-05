"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionLabel } from "@/components/ui/screen";
import { pluralPl } from "@/lib/format";
import { loadRoutines, useRoutinesState } from "@/lib/routines/store";
import { startEmptyWorkout, startWorkoutFromRoutine } from "@/lib/workout/store";

/**
 * Empty state of the workout screen: one primary button and the template
 * list as rows. Tap on a template immediately starts the workout
 * (`applyRoutine`), with no preview screen — a template is a shortcut,
 * not a form. Composing and editing templates lives separately on
 * `/szablony`.
 *
 * The list goes through `lib/routines/store`, i.e. Dexie first: it used
 * to read straight from the API and in a gym without signal a template
 * could not be launched, even though the records were already on the
 * device.
 */
export function WorkoutStart() {
  const { status, routines } = useRoutinesState();

  useEffect(() => {
    void loadRoutines();
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
      <p className="mt-3 text-center">
        <Link
          href="/trening/nowy-historyczny"
          className="label-caps text-ink-2 underline underline-offset-4"
        >
          Wpisz trening z przeszłości
        </Link>
      </p>

      <div className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>Rozpocznij z szablonu</SectionLabel>
          <Link
            href="/szablony"
            className="label-caps shrink-0 text-ink-2 underline underline-offset-4"
          >
            Zarządzaj
          </Link>
        </div>
        {status !== "ready" && routines.length === 0 ? null : routines.length === 0 ? (
          <p className="meta">
            Nie masz jeszcze szablonów.{" "}
            <Link href="/szablony/nowy" className="text-ink underline underline-offset-4">
              Ułóż pierwszy
            </Link>{" "}
            albo zapisz jako szablon trening, który właśnie skończysz.
          </p>
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
