"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Screen, SectionLabel } from "@/components/ui/screen";
import { Sheet } from "@/components/ui/sheet";
import { findExercises } from "@/lib/exercise/catalog";
import { NO_FILTERS, type ExportFilters } from "@/lib/export/dataset";
import { NoLocalDataError, downloadBlob, runExport } from "@/lib/export/run";
import { pluralPl } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { useSyncState } from "@/lib/sync/use-sync";
import { todayIsoDate } from "@/lib/bodyweight/input";
import type { ExerciseResponse } from "@/types/api";

/**
 * Eksport do Excela (PROMPT §7). Plik składa przeglądarka z danych, które już
 * są w Dexie — po pierwszej synchronizacji leży tam komplet historii, więc
 * eksport nie potrzebuje nowego endpointu i działa bez zasięgu.
 *
 * Arkusz „Serie” jest płaskim źródłem pod tabelę przestawną (nazwany zakres
 * `Serie_Dane`). Świadomie NIE wklejamy wykresów jako obrazków: obrazek nie
 * reaguje na filtr ani na pivot, więc po pierwszym kliknięciu w Excelu
 * pokazywałby co innego niż tabela obok.
 */

type Status = "idle" | "working" | "done" | "error";

export function ExportScreen() {
  const { settings } = useSettings();
  const sync = useSyncState();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [workingSetsOnly, setWorkingSetsOnly] = useState(false);
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<ExerciseResponse[]>([]);
  const [picking, setPicking] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Rozgrzewamy chunk ExcelJS, póki jest zasięg. Biblioteka wchodzi
    // dynamicznym importem (waży więcej niż reszta apki), a service worker
    // cache'uje `/_next/static/` DOPIERO po pierwszym pobraniu — bez tego
    // eksport bez zasięgu wywalał się na samym imporcie, mimo że dane leżą
    // w Dexie. Złapane dopiero na buildzie produkcyjnym, bo w `next dev`
    // service workera nie ma w ogóle.
    void import("exceljs").catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void findExercises("", controller.signal)
      .then(setCatalog)
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, []);

  const selected = useMemo(
    () => catalog.filter((exercise) => exerciseIds.includes(exercise.id)),
    [catalog, exerciseIds],
  );

  const filters: ExportFilters = {
    ...NO_FILTERS,
    from: from === "" ? null : from,
    to: to === "" ? null : to,
    exerciseIds: exerciseIds.length === 0 ? null : exerciseIds,
    workingSetsOnly,
  };

  const start = (): void => {
    setStatus("working");
    setMessage(null);
    void runExport(filters, settings.oneRepMaxFormula)
      .then((result) => {
        downloadBlob(result.blob, result.fileName);
        setStatus("done");
        setMessage(
          `${result.fileName} — ${describe(result.dataset.workouts.length, result.dataset.sets.length)}`,
        );
      })
      .catch((cause: unknown) => {
        setStatus("error");
        setMessage(
          cause instanceof NoLocalDataError
            ? cause.message
            : "Nie udało się zbudować pliku. Spróbuj zawęzić zakres dat.",
        );
      });
  };

  return (
    <Screen>
      <SectionLabel>Eksport do Excela</SectionLabel>

      <div className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="label-caps mb-1 block">Od</span>
            <input
              type="date"
              value={from}
              max={to === "" ? todayIsoDate() : to}
              onChange={(event) => {
                setFrom(event.target.value);
              }}
              className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="label-caps mb-1 block">Do</span>
            <input
              type="date"
              value={to}
              min={from === "" ? undefined : from}
              max={todayIsoDate()}
              onChange={(event) => {
                setTo(event.target.value);
              }}
              className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
            />
          </label>
        </div>
        <p className="meta mt-2">Puste pola = cała historia.</p>

        <div className="mt-4">
          <span className="label-caps mb-1 block">Ćwiczenia</span>
          <button
            type="button"
            onClick={() => {
              setPicking(true);
            }}
            className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-left text-ink active:bg-surface-3"
          >
            {selected.length === 0
              ? "Wszystkie"
              : `${String(selected.length)} ${pluralPl(selected.length, "wybrane", "wybrane", "wybranych")}`}
          </button>
          {selected.length > 0 && (
            <p className="meta mt-1 truncate">
              {selected.map((exercise) => exercise.name).join(", ")}
            </p>
          )}
        </div>

        <button
          type="button"
          aria-pressed={workingSetsOnly}
          onClick={() => {
            setWorkingSetsOnly((current) => !current);
          }}
          className={[
            "mt-4 h-touch inline-flex items-center rounded-full border px-3 text-[13px] font-semibold",
            workingSetsOnly ? "border-transparent" : "border-hairline text-ink-3",
          ].join(" ")}
          style={
            workingSetsOnly ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined
          }
        >
          Tylko serie robocze
        </button>
      </div>

      <Button fullWidth className="mt-4" disabled={status === "working"} onClick={start}>
        {status === "working" ? "Składam plik…" : "Pobierz plik .xlsx"}
      </Button>

      {message !== null && (
        <p
          className="meta mt-3"
          role={status === "error" ? "alert" : "status"}
          style={status === "error" ? { color: "var(--critical)" } : undefined}
        >
          {message}
        </p>
      )}

      {/* Uczciwość źródła: plik składa się z danych z TEGO urządzenia. Przed
          eksportem próbujemy się zsynchronizować, ale bez zasięgu plik i tak
          powstanie — tylko bez sesji zrobionej właśnie na innym telefonie. */}
      <p className="meta mt-4">
        Plik powstaje z danych na tym urządzeniu; przed pobraniem apka próbuje się
        zsynchronizować.{" "}
        {sync.pending > 0
          ? `${String(sync.pending)} ${pluralPl(sync.pending, "zmiana czeka", "zmiany czekają", "zmian czeka")} na wysłanie.`
          : "Wszystko wysłane."}
      </p>

      <div className="mt-6 rounded-card border border-hairline bg-surface p-4">
        <p className="label-caps">Co jest w pliku</p>
        <ul className="meta mt-2 list-disc pl-4">
          <li>Podsumowanie, Treningi, Serie, Progres, Waga ciała, Waga tygodniowo</li>
          <li>
            Arkusz „Serie” to jeden wiersz na serię, z nazwanym zakresem{" "}
            <span className="text-ink-2">Serie_Dane</span> — wstaw tabelę przestawną i zrób
            z niej dowolny wykres
          </li>
          <li>Wiersze z rekordem są podświetlone, spadki na czerwono, wzrosty na zielono</li>
        </ul>
      </div>

      {picking && (
        <Sheet
          title="Ćwiczenia do eksportu"
          onClose={() => {
            setPicking(false);
          }}
          variant="full"
        >
          <ExercisePicker
            catalog={catalog}
            selected={exerciseIds}
            onToggle={(id) => {
              setExerciseIds((current) =>
                current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
              );
            }}
            onClear={() => {
              setExerciseIds([]);
            }}
          />
        </Sheet>
      )}
    </Screen>
  );
}

function ExercisePicker({
  catalog,
  selected,
  onToggle,
  onClear,
}: {
  catalog: readonly ExerciseResponse[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = catalog.filter((exercise) =>
    exercise.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div>
      <input
        value={query}
        placeholder="Szukaj ćwiczenia"
        aria-label="Szukaj ćwiczenia"
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
      />
      <button
        type="button"
        onClick={onClear}
        className="mt-3 h-touch text-[13px] font-semibold text-ink-2 underline underline-offset-4"
      >
        Wyczyść wybór (eksportuj wszystkie)
      </button>
      <ul className="mt-2">
        {visible.map((exercise) => {
          const checked = selected.includes(exercise.id);
          return (
            <li key={exercise.id} className="border-t border-hairline">
              <label className="flex min-h-touch items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    onToggle(exercise.id);
                  }}
                  className="size-5 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-ink">{exercise.name}</span>
                <span className="meta shrink-0">{exercise.muscleGroup}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function describe(workouts: number, sets: number): string {
  return `${String(workouts)} ${pluralPl(workouts, "trening", "treningi", "treningów")}, ${String(sets)} ${pluralPl(sets, "seria", "serie", "serii")}`;
}
