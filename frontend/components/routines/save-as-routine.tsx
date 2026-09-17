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
 * „Zapisz ten trening jako szablon" — najkrótsza droga do planu, bo bierze
 * układ, który właśnie się sprawdził, zamiast kazać go składać od zera.
 *
 * Cele serii i powtórzeń liczy `draftFromWorkout` z serii ROBOCZYCH tej
 * sesji, więc szablon startuje z liczbami, które ktoś naprawdę wykonał,
 * a nie z okrągłych domyślnych.
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
