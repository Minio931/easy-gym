"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/screen";
import { Sheet } from "@/components/ui/sheet";
import { NAME_MAX_LENGTH, draftFromWorkout, validateDraft } from "@/lib/routines/draft";
import { saveRoutine, useRoutinesState } from "@/lib/routines/store";
import type { WorkoutDetailResponse } from "@/types/api";

/**
 * "Save this workout as a template" — the shortest path to a plan,
 * because it takes a layout that just worked instead of forcing one to
 * compose it from scratch.
 *
 * The set and rep targets are computed by `draftFromWorkout` from this
 * session's WORKING sets, so the template starts with numbers someone
 * really performed, not round defaults.
 */
export function SaveAsRoutine({ workout }: { workout: WorkoutDetailResponse }) {
  const { saving } = useRoutinesState();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => suggestName(workout.startedAt));
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (workout.exercises.length === 0) {
    return null;
  }

  if (savedId !== null) {
    return (
      <section className="mt-8">
        <SectionLabel>Szablon</SectionLabel>
        <p className="text-ink-2">
          Zapisane. Ten układ jest teraz na liście startu treningu —{" "}
          <Link href={`/szablony/${savedId}`} className="text-ink underline underline-offset-4">
            popraw cele
          </Link>
          , jeśli plan ma być inny niż wykonanie.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <Button
        variant="secondary"
        fullWidth
        onClick={() => {
          setOpen(true);
        }}
      >
        Zapisz jako szablon
      </Button>

      {open && (
        <Sheet
          title="Nowy szablon z tego treningu"
          onClose={() => {
            setOpen(false);
          }}
        >
          <label className="block">
            <span className="label-caps mb-1 block">Nazwa</span>
            <input
              value={name}
              maxLength={NAME_MAX_LENGTH}
              autoFocus
              onChange={(event) => {
                setName(event.target.value);
              }}
              className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
            />
          </label>
          <p className="meta mt-2">
            Zapiszemy kolejność ćwiczeń i liczbę serii roboczych jako cel. Ciężary zostają
            przy treningu — w szablonie ich nie ma.
          </p>
          {error !== null && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--critical)" }} role="alert">
              {error}
            </p>
          )}
          <Button
            fullWidth
            className="mt-4"
            disabled={saving}
            onClick={() => {
              const draft = draftFromWorkout(workout, name);
              const problem = validateDraft(draft);
              setError(problem);
              if (problem !== null) {
                return;
              }
              void saveRoutine(draft).then((id) => {
                if (id === null) {
                  setError("Nie udało się zapisać szablonu.");
                  return;
                }
                setOpen(false);
                setSavedId(id);
              });
            }}
          >
            {saving ? "Zapisuję…" : "Zapisz szablon"}
          </Button>
        </Sheet>
      )}
    </section>
  );
}

function suggestName(startedAt: string): string {
  return `Trening ${new Date(startedAt).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
  })}`;
}
