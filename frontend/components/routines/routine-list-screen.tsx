"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Screen, SectionLabel, Skeleton } from "@/components/ui/screen";
import { Sheet } from "@/components/ui/sheet";
import { pluralPl } from "@/lib/format";
import { totalTargetSets } from "@/lib/routines/draft";
import { loadRoutines, removeRoutine, useRoutinesState } from "@/lib/routines/store";
import type { RoutineResponse } from "@/types/api";

/**
 * Lista szablonów — ekran zarządzania, nie startu. Trening odpala się
 * z `/trening`, tutaj szablony się układa i poprawia, więc tap w wiersz
 * otwiera edytor, a nie sesję. Dwa różne skutki tego samego gestu na dwóch
 * ekranach byłyby gorsze niż jedno dodatkowe kliknięcie.
 */
export function RoutineListScreen() {
  const { status, routines, local, error } = useRoutinesState();
  const [toDelete, setToDelete] = useState<RoutineResponse | null>(null);

  useEffect(() => {
    void loadRoutines();
  }, []);

  if (status !== "ready" && routines.length === 0) {
    return (
      <Screen>
        <SectionLabel>Szablony</SectionLabel>
        <Skeleton className="mb-2 h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionLabel>Szablony</SectionLabel>

      {error !== null && <p className="meta mb-2">{error}</p>}
      {local && routines.length > 0 && (
        <p className="meta mb-2">
          Lista z tego urządzenia — po odzyskaniu sieci odświeży się z serwera.
        </p>
      )}

      {routines.length === 0 ? (
        <EmptyState
          message="Nie masz jeszcze szablonów. Ułóż stały plan raz, a potem odpalaj go jednym tapnięciem zamiast dobierać ćwiczenia za każdym razem."
          action={
            <Link
              href="/szablony/nowy"
              className="h-control inline-flex items-center rounded-control bg-cta px-5 font-semibold text-cta-ink"
            >
              Nowy szablon
            </Link>
          }
        />
      ) : (
        <>
          <ul className="overflow-hidden rounded-card border border-hairline bg-surface">
            {routines.map((routine, index) => (
              <li
                key={routine.id}
                className={`flex items-center ${index === 0 ? "" : "border-t border-hairline"}`}
              >
                <Link
                  href={`/szablony/${routine.id}`}
                  className="flex min-w-0 flex-1 flex-col justify-center py-3 pl-4 active:bg-surface-2"
                >
                  <span className="truncate text-ink">{routine.name}</span>
                  <span className="meta truncate">{summary(routine)}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setToDelete(routine);
                  }}
                  aria-label={`Usuń szablon ${routine.name}`}
                  className="mr-1 flex size-touch shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <Link
            href="/szablony/nowy"
            className="h-control mt-4 flex w-full items-center justify-center rounded-control border border-hairline bg-surface-2 font-semibold text-ink active:bg-surface-3"
          >
            Nowy szablon
          </Link>
        </>
      )}

      {toDelete !== null && (
        <Sheet
          title="Usunąć szablon?"
          onClose={() => {
            setToDelete(null);
          }}
        >
          {/* Szablon to praca włożona raz i używana miesiącami — na to pytamy,
              inaczej niż przy serii, którą da się wpisać z powrotem w pięć
              sekund i która ma „Cofnij". */}
          <p className="text-ink-2">
            {`„${toDelete.name}"`} zniknie z listy startu treningu. Treningi zrobione z tego szablonu
            zostają nietknięte.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setToDelete(null);
              }}
            >
              Zostaw
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                const id = toDelete.id;
                setToDelete(null);
                void removeRoutine(id);
              }}
            >
              Usuń
            </Button>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

function summary(routine: RoutineResponse): string {
  const exercises = routine.items.filter((item) => item.deletedAt === null).length;
  const sets = totalTargetSets(routine);
  const exercisesLabel = `${String(exercises)} ${pluralPl(exercises, "ćwiczenie", "ćwiczenia", "ćwiczeń")}`;
  return sets === 0
    ? exercisesLabel
    : `${exercisesLabel} · ${String(sets)} ${pluralPl(sets, "seria", "serie", "serii")}`;
}
