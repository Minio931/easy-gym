"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ExercisePickerSheet } from "@/components/workout/exercise-picker-sheet";
import { Button } from "@/components/ui/button";
import { Screen, SectionLabel, Skeleton } from "@/components/ui/screen";
import { getRoutine } from "@/lib/api/routines";
import { getDatabase } from "@/lib/db/database";
import { readRoutine } from "@/lib/db/routine-repository";
import { findExercises } from "@/lib/exercise/catalog";
import {
  NAME_MAX_LENGTH,
  TARGET_REPS_MAX,
  TARGET_REPS_MIN,
  TARGET_SETS_MAX,
  TARGET_SETS_MIN,
  addItem,
  draftFromRoutine,
  emptyDraft,
  moveItem,
  parseTarget,
  removeItem,
  setItemTarget,
  validateDraft,
  type RoutineDraft,
} from "@/lib/routines/draft";
import { saveRoutine, useRoutinesState } from "@/lib/routines/store";

/**
 * Template editor. ARROWS reorder exercises, not drag: the list is
 * vertical inside a scrollable page, so drag on a phone fights the
 * scroll and loses in the gym (DESIGN §9 — the gesture must not be the
 * only path). Two taps on an arrow are boring and always work.
 *
 * The set and rep targets are optional. An empty field means no target,
 * not zero — `targetSets` drives the "0/3" counter on the exercise card,
 * and zero would mean "exercise planned for zero sets".
 */
export function RoutineEditorScreen({ routineId }: { routineId: string | null }) {
  const router = useRouter();
  const { saving } = useRoutinesState();
  const [draft, setDraft] = useState<RoutineDraft | null>(routineId === null ? emptyDraft() : null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Exercise catalog: the template response carries only `exerciseId`,
  // and names must come from somewhere. `findExercises` falls back to
  // the local catalog offline.
  useEffect(() => {
    const controller = new AbortController();
    void findExercises("", controller.signal)
      .then((exercises) => {
        setNames(new Map(exercises.map((exercise) => [exercise.id, exercise.name])));
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (routineId === null) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      const db = getDatabase();
      // Dexie first: the editor opens complete even offline.
      const local = db === null ? null : await readRoutine(db, routineId).catch(() => null);
      if (!cancelled && local !== null) {
        setDraft(draftFromRoutine(local, names));
      }
      try {
        const server = await getRoutine(routineId);
        if (!cancelled) {
          setDraft(draftFromRoutine(server, names));
        }
      } catch {
        if (!cancelled && local === null) {
          setLoadError("Nie udało się wczytać szablonu.");
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // `names` deliberately outside deps: fetching the catalog must not
    // overwrite a draft the user has already touched. `withNames` fills
    // the names at render time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId]);

  const items = useMemo(
    () =>
      (draft?.items ?? []).map((item) => ({
        ...item,
        exerciseName: names.get(item.exerciseId) ?? item.exerciseName,
      })),
    [draft, names],
  );

  if (loadError !== null) {
    return (
      <Screen>
        <SectionLabel>Szablon</SectionLabel>
        <p className="text-ink-2">{loadError}</p>
      </Screen>
    );
  }

  if (draft === null) {
    return (
      <Screen>
        <SectionLabel>Szablon</SectionLabel>
        <Skeleton className="mb-3 h-14 w-full" />
        <Skeleton className="h-40 w-full" />
      </Screen>
    );
  }

  const submit = (): void => {
    const problem = validateDraft(draft);
    setError(problem);
    if (problem !== null) {
      return;
    }
    void saveRoutine(draft).then((id) => {
      if (id !== null) {
        router.push("/szablony");
      }
    });
  };

  return (
    <Screen>
      <SectionLabel>{routineId === null ? "Nowy szablon" : "Edycja szablonu"}</SectionLabel>

      <label className="block">
        <span className="label-caps mb-1 block">Nazwa</span>
        <input
          value={draft.name}
          maxLength={NAME_MAX_LENGTH}
          placeholder="np. Push A"
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
          }}
          className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
        />
      </label>

      <label className="mt-3 block">
        <span className="label-caps mb-1 block">Notatka (opcjonalnie)</span>
        <textarea
          value={draft.notes}
          rows={2}
          placeholder="np. przerwy 3 min na bojach"
          onChange={(event) => {
            setDraft({ ...draft, notes: event.target.value });
          }}
          className="w-full rounded-control border border-hairline bg-surface-2 p-3 text-ink"
        />
      </label>

      <div className="mt-6">
        <SectionLabel>Ćwiczenia</SectionLabel>
        {items.length === 0 ? (
          <p className="meta">Pusty szablon. Dodaj pierwsze ćwiczenie.</p>
        ) : (
          <ul className="overflow-hidden rounded-card border border-hairline bg-surface">
            {items.map((item, index) => (
              <li
                key={`${item.exerciseId}-${String(index)}`}
                className={`px-3 py-3 ${index === 0 ? "" : "border-t border-hairline"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="meta w-5 shrink-0 tabular-nums">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{item.exerciseName}</span>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      setDraft(moveItem(draft, index, -1));
                    }}
                    aria-label={`Przesuń ${item.exerciseName} w górę`}
                    className="flex size-touch shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === items.length - 1}
                    onClick={() => {
                      setDraft(moveItem(draft, index, 1));
                    }}
                    aria-label={`Przesuń ${item.exerciseName} w dół`}
                    className="flex size-touch shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(removeItem(draft, index));
                    }}
                    aria-label={`Usuń ${item.exerciseName} z szablonu`}
                    className="flex size-touch shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-2 flex gap-2 pl-7">
                  <TargetField
                    label="Serie"
                    value={item.targetSets}
                    min={TARGET_SETS_MIN}
                    max={TARGET_SETS_MAX}
                    exerciseName={item.exerciseName}
                    onChange={(targetSets) => {
                      setDraft(setItemTarget(draft, index, { targetSets }));
                    }}
                  />
                  <TargetField
                    label="Powt."
                    value={item.targetReps}
                    min={TARGET_REPS_MIN}
                    max={TARGET_REPS_MAX}
                    exerciseName={item.exerciseName}
                    onChange={(targetReps) => {
                      setDraft(setItemTarget(draft, index, { targetReps }));
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button
          variant="secondary"
          fullWidth
          className="mt-3"
          onClick={() => {
            setPicking(true);
          }}
        >
          + Dodaj ćwiczenie
        </Button>
      </div>

      {error !== null && (
        <p className="mt-4 text-[13px]" style={{ color: "var(--critical)" }} role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-2">
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            router.push("/szablony");
          }}
        >
          Anuluj
        </Button>
        <Button fullWidth disabled={saving} onClick={submit}>
          {saving ? "Zapisuję…" : "Zapisz szablon"}
        </Button>
      </div>

      {picking && (
        <ExercisePickerSheet
          onPick={(exercise) => {
            setDraft(addItem(draft, exercise));
            setPicking(false);
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </Screen>
  );
}

function TargetField({
  label,
  value,
  min,
  max,
  exerciseName,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  exerciseName: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2">
      <span className="label-caps shrink-0">{label}</span>
      <input
        inputMode="numeric"
        value={value === null ? "" : String(value)}
        placeholder="—"
        // The visual label is shared across the row, so without this a
        // screen reader hears five times "Serie" without knowing whose.
        aria-label={`${label} — ${exerciseName}`}
        onChange={(event) => {
          onChange(parseTarget(event.target.value, min, max));
        }}
        className="h-touch w-full min-w-0 rounded-control border border-hairline bg-surface-2 px-2 text-right text-ink tabular-nums"
      />
    </label>
  );
}
