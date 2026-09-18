"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { SearchIcon } from "@/components/ui/icons";
import { createExercise } from "@/lib/api/exercises";
import { findExercises } from "@/lib/exercise/catalog";
import { isAbortError } from "@/lib/api/errors";
import { useRecentExerciseIds } from "@/lib/workout/recent-exercises";
import { uuid } from "@/lib/workout/uuid";
import type { ExerciseResponse } from "@/types/api";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const MAX_RECENT = 8;

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: "sztanga",
  dumbbell: "hantle",
  machine: "maszyna",
  cable: "wyciąg",
  bodyweight: "masa ciała",
  other: "inne",
};

/**
 * Arkusz wyboru ćwiczenia. Tap w wiersz = ćwiczenie w treningu, bez
 * potwierdzania i bez kroku „wybierz i zatwierdź" — to jest akcja wykonywana
 * między seriami, a nie konfiguracja.
 *
 * Szukanie leci do `GET /api/exercises?query=`, bo fuzzy (pg_trgm) jest po
 * stronie bazy. Katalog bez frazy pobieramy raz przy otwarciu: daje jednocześnie
 * nazwy do „Ostatnio używanych" (localStorage trzyma same `id`), listę
 * wszystkich ćwiczeń i zestaw grup mięśniowych do formularza własnego ćwiczenia.
 */
export function ExercisePickerSheet({
  onPick,
  onClose,
}: {
  onPick: (exercise: ExerciseResponse) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<ExerciseResponse[]>([]);
  const [results, setResults] = useState<ExerciseResponse[] | null>(null);
  const [creating, setCreating] = useState(false);
  const recentIds = useRecentExerciseIds();

  useEffect(() => {
    const controller = new AbortController();
    void findExercises("", controller.signal)
      .then(setCatalog)
      .catch(() => {
        /* offline: zostają „Ostatnio używane" z pamięci przeglądarki */
      });
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void findExercises(query.trim(), controller.signal)
        .then(setResults)
        .catch((error: unknown) => {
          if (!isAbortError(error)) {
            setResults([]);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const recent = useMemo(
    () =>
      recentIds
        .map((id) => catalog.find((exercise) => exercise.id === id))
        .filter((exercise): exercise is ExerciseResponse => exercise !== undefined)
        .slice(0, MAX_RECENT),
    [recentIds, catalog],
  );

  const muscleGroups = useMemo(
    () => [...new Set(catalog.map((exercise) => exercise.muscleGroup))].sort((a, b) => a.localeCompare(b, "pl")),
    [catalog],
  );

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;

  return (
    <Sheet title="Dodaj ćwiczenie" variant="full" onClose={onClose}>
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
        <div className="flex h-control flex-1 items-center gap-2 rounded-control bg-surface-2 px-3">
          <SearchIcon className="shrink-0 text-ink-3" />
          <label htmlFor="szukaj-cwiczenia" className="sr-only">
            Szukaj ćwiczenia
          </label>
          <input
            id="szukaj-cwiczenia"
            type="text"
            autoFocus
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Szukaj ćwiczenia"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setResults(null);
              setCreating(false);
            }}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-touch shrink-0 px-2 text-[15px] font-semibold text-ink-2"
        >
          Anuluj
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))]">
        {creating ? (
          <CustomExerciseForm
            initialName={trimmed}
            muscleGroups={muscleGroups}
            onCancel={() => {
              setCreating(false);
            }}
            onCreated={onPick}
          />
        ) : searching ? (
          <SearchResults
            query={trimmed}
            results={results}
            onPick={onPick}
            onCreate={() => {
              setCreating(true);
            }}
          />
        ) : (
          <>
            {recent.length > 0 && (
              <ExerciseGroup label="Ostatnio używane" exercises={recent} onPick={onPick} />
            )}
            <ExerciseGroup label="Wszystkie ćwiczenia" exercises={catalog} onPick={onPick} />
          </>
        )}
      </div>
    </Sheet>
  );
}

function SearchResults({
  query,
  results,
  onPick,
  onCreate,
}: {
  query: string;
  results: ExerciseResponse[] | null;
  onPick: (exercise: ExerciseResponse) => void;
  onCreate: () => void;
}) {
  if (results === null) {
    return <p className="meta py-4">Szukam…</p>;
  }
  if (results.length === 0) {
    return (
      <div className="py-6">
        <p className="text-ink-2">Nie znaleziono ćwiczenia „{query}&rdquo;.</p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 h-control w-full rounded-control bg-cta px-5 font-semibold text-cta-ink"
        >
          Dodaj własne ćwiczenie „{query}&rdquo;
        </button>
      </div>
    );
  }
  // Fuzzy search (pg_trgm) potrafi zwrócić coś podobnego zamiast niczego --
  // „Wyciskanie francuskie" na frazę „Wyciskanie wojskowe". Bez tego wyjścia
  // trafienie obok blokowało dodanie własnego ćwiczenia: user widział listę,
  // której nie chciał, i nie miał czym jej ominąć. Przycisk jest stonowany,
  // żeby nie konkurował z wynikami, kiedy wyszukiwarka trafiła.
  return (
    <>
      <ExerciseGroup label="Wyniki" exercises={results} onPick={onPick} />
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 h-control w-full rounded-control border border-hairline px-5 font-semibold text-ink-2 active:bg-surface-2"
      >
        Żadne z tych — dodaj „{query}&rdquo;
      </button>
    </>
  );
}

function ExerciseGroup({
  label,
  exercises,
  onPick,
}: {
  label: string;
  exercises: readonly ExerciseResponse[];
  onPick: (exercise: ExerciseResponse) => void;
}) {
  if (exercises.length === 0) {
    return null;
  }
  return (
    <section className="pt-5">
      <h3 className="label-caps mb-1">{label}</h3>
      <ul>
        {exercises.map((exercise) => (
          <li key={exercise.id} className="border-b border-hairline">
            <button
              type="button"
              onClick={() => {
                onPick(exercise);
              }}
              className="flex h-14 w-full flex-col justify-center text-left active:bg-surface-2"
            >
              <span className="truncate text-ink">{exercise.name}</span>
              <span className="meta truncate">
                {exercise.muscleGroup} · {EQUIPMENT_LABELS[exercise.equipment] ?? exercise.equipment}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CustomExerciseForm({
  initialName,
  muscleGroups,
  onCancel,
  onCreated,
}: {
  initialName: string;
  muscleGroups: readonly string[];
  onCancel: () => void;
  onCreated: (exercise: ExerciseResponse) => void;
}) {
  // Nazwa jest edytowalna, bo fraza z wyszukiwarki bywa skrótem („wycisk"),
  // po którym coś się jednak znalazło. Zapisanie ćwiczenia pod taką nazwą
  // zaśmiecałoby katalog na stałe -- w przeciwieństwie do serii, tego się
  // potem nie poprawia jednym tapnięciem.
  const [name, setName] = useState(initialName);
  const [muscleGroup, setMuscleGroup] = useState(muscleGroups[0] ?? "inne");
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();

  return (
    <form
      className="pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        // `equipment: "other"` domyślnie — user, który właśnie nie znalazł
        // swojego ćwiczenia, nie chce teraz wypełniać metryczki sprzętu.
        void createExercise({ id: uuid(), name: trimmedName, muscleGroup, equipment: "other" })
          .then(onCreated)
          .catch(() => {
            setError("Nie udało się dodać ćwiczenia. Spróbuj ponownie.");
          });
      }}
    >
      <label htmlFor="nazwa-cwiczenia" className="label-caps mb-2 block">
        Nazwa ćwiczenia
      </label>
      <input
        id="nazwa-cwiczenia"
        type="text"
        autoComplete="off"
        maxLength={200}
        className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <label htmlFor="grupa-miesniowa" className="label-caps mt-5 mb-2 block">
        Grupa mięśniowa
      </label>
      <select
        id="grupa-miesniowa"
        className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
        value={muscleGroup}
        onChange={(event) => {
          setMuscleGroup(event.target.value);
        }}
      >
        {muscleGroups.map((group) => (
          <option key={group} value={group}>
            {group}
          </option>
        ))}
      </select>
      {error !== null && (
        <p className="meta mt-3" style={{ color: "var(--critical)" }} role="alert">
          {error}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-control flex-1 rounded-control border border-hairline font-semibold text-ink-2"
        >
          Anuluj
        </button>
        <button
          type="submit"
          disabled={trimmedName.length === 0}
          className="h-control flex-1 rounded-control bg-cta font-semibold text-cta-ink disabled:opacity-40"
        >
          Dodaj
        </button>
      </div>
    </form>
  );
}
