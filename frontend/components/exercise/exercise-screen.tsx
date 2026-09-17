"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartTile, type ChartTableColumn } from "@/components/charts/chart-tile";
import {
  E1rmChart,
  SessionVolumeChart,
  WeightProgressChart,
} from "@/components/charts/exercise-charts";
import { EmptyState, Screen, SectionLabel, Skeleton } from "@/components/ui/screen";
import { exerciseHistory } from "@/lib/api/exercises";
import { isAbortError, messageForUser } from "@/lib/api/errors";
import { DEFAULT_CHART_RANGE, filterByRange, type ChartRange } from "@/lib/charts";
import {
  e1rmPoints,
  latestValue,
  volumePoints,
  weightProgressPoints,
  type E1rmPoint,
  type VolumePoint,
  type WeightPoint,
} from "@/lib/exercise/history";
import { formatVolume, formatWeight } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type { ExerciseHistoryResponse, PersonalRecordsResponse, RepRangeKey } from "@/types/api";

/**
 * Ekran pojedynczego ćwiczenia: rekordy + trzy wykresy (DESIGN §10, PROMPT §6).
 *
 * Jeden przełącznik zakresu na cały ekran, mimo że pigułki — zgodnie z DESIGN
 * §7.6 — siedzą w każdym kaflu. Trzy niezależne zakresy dałyby trzy wykresy
 * pokazujące różne okresy obok siebie, czyli zestawienie, z którego nie da się
 * nic wywnioskować. Pigułki są tam, gdzie mówi system projektowy, ale wskazują
 * jeden stan.
 *
 * Ile sesji ściągamy: `limit` 100. To jest ekran JEDNEGO ćwiczenia, więc mowa
 * o setkach serii, nie o całej historii konta — agregaty na skalę konta robi
 * backend (PROMPT §9), ale tutaj dane i tak są potrzebne w komplecie, żeby
 * przełącznik zakresu działał bez kolejnej rundy do serwera.
 */

const REP_RANGE_LABELS: Record<RepRangeKey, string> = {
  ONE: "1",
  TWO_TO_THREE: "2–3",
  FOUR_TO_SIX: "4–6",
  SEVEN_TO_TEN: "7–10",
  ELEVEN_TO_FIFTEEN: "11–15",
  FIFTEEN_PLUS: "15+",
};

const HISTORY_LIMIT = 100;

function formatSessionDate(instant: string): string {
  return new Date(instant).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function ExerciseScreen({ exerciseId }: { exerciseId: string }) {
  const { settings } = useSettings();
  // Moment wczytania trzymamy RAZEM z danymi, a nie jako osobne `new Date()`
  // w `useMemo`. Inaczej „teraz" byłoby liczone poza zależnościami hooka:
  // trzy wykresy mogłyby dostać trzy różne chwile i skrajny punkt zniknąłby
  // z jednego z nich, a lint słusznie by na to nakrzyczał.
  const [loaded, setLoaded] = useState<{ history: ExerciseHistoryResponse; at: Date } | null>(null);
  const history = loaded?.history ?? null;
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);

  useEffect(() => {
    const controller = new AbortController();
    void exerciseHistory(exerciseId, {
      limit: HISTORY_LIMIT,
      formula: settings.oneRepMaxFormula,
      signal: controller.signal,
    })
      .then((response) => {
        setLoaded({ history: response, at: new Date() });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!isAbortError(cause)) {
          setError(messageForUser(cause));
        }
      });
    return () => {
      controller.abort();
    };
  }, [exerciseId, settings.oneRepMaxFormula]);

  const points = useMemo(() => {
    const sessions = loaded?.history.sessions ?? [];
    const now = loaded?.at ?? new Date();
    return {
      weight: filterByRange(weightProgressPoints(sessions), range, now, (p) => p.startedAt),
      e1rm: filterByRange(e1rmPoints(sessions), range, now, (p) => p.startedAt),
      volume: filterByRange(volumePoints(sessions), range, now, (p) => p.startedAt),
    };
  }, [loaded, range]);

  if (error !== null && history === null) {
    return (
      <Screen>
        <EmptyState message={error} />
      </Screen>
    );
  }

  if (history === null) {
    return (
      <Screen>
        <Skeleton className="mb-3 h-14 w-full" />
        <Skeleton className="mb-3 h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </Screen>
    );
  }

  if (history.sessions.length === 0) {
    return (
      <Screen>
        <ExerciseHeader history={history} />
        <div className="mt-6">
          <EmptyState message="Tego ćwiczenia nie ma jeszcze w żadnym treningu. Wykresy pojawią się po pierwszej zapisanej serii." />
        </div>
      </Screen>
    );
  }

  const latestWeight = latestValue(points.weight, (point) => point.weightKg);
  const latestE1rm = latestValue(points.e1rm, (point) => point.e1rmKg);
  const latestVolume = latestValue(points.volume, (point) => point.volumeKg);

  return (
    <Screen>
      <ExerciseHeader history={history} />

      <PersonalRecords records={history.personalRecords} />

      <div className="mt-6 flex flex-col gap-3">
        <ChartTile<WeightPoint>
          title="Ciężar"
          value={latestWeight === null ? null : `${formatWeight(latestWeight)} kg`}
          range={range}
          onRangeChange={setRange}
          rows={points.weight}
          rowKey={(row) => row.workoutId}
          emptyMessage="Brak serii roboczych w tym zakresie."
          columns={WEIGHT_COLUMNS}
        >
          <WeightProgressChart points={points.weight} />
        </ChartTile>

        <p className="meta -mt-1">
          Wielkość punktu na wykresie ciężaru to liczba powtórzeń — większy punkt
          znaczy więcej powtórzeń na tym ciężarze.
        </p>

        <ChartTile<E1rmPoint>
          title={`e1RM · ${settings.oneRepMaxFormula === "epley" ? "Epley" : "Brzycki"}`}
          value={latestE1rm === null ? null : `${formatWeight(latestE1rm)} kg`}
          range={range}
          onRangeChange={setRange}
          rows={points.e1rm}
          rowKey={(row) => row.workoutId}
          emptyMessage="Brak danych e1RM w tym zakresie."
          columns={E1RM_COLUMNS}
        >
          <E1rmChart points={points.e1rm} />
        </ChartTile>

        <ChartTile<VolumePoint>
          title="Objętość sesji"
          value={latestVolume === null ? null : `${formatVolume(latestVolume)} kg`}
          range={range}
          onRangeChange={setRange}
          rows={points.volume}
          rowKey={(row) => row.workoutId}
          emptyMessage="Brak sesji w tym zakresie."
          columns={VOLUME_COLUMNS}
        >
          <SessionVolumeChart points={points.volume} />
        </ChartTile>
      </div>
    </Screen>
  );
}

function ExerciseHeader({ history }: { history: ExerciseHistoryResponse }) {
  return (
    <header>
      <h2 className="screen-title">{history.name}</h2>
      <p className="meta mt-0.5">
        {history.muscleGroup} · {EQUIPMENT_LABELS[history.equipment]}
      </p>
    </header>
  );
}

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: "sztanga",
  dumbbell: "hantle",
  machine: "maszyna",
  cable: "wyciąg",
  bodyweight: "masa ciała",
  other: "inne",
};

function PersonalRecords({ records }: { records: PersonalRecordsResponse }) {
  const repRanges = Object.entries(records.byRepRange) as [RepRangeKey, { value: number }][];
  const hasAny =
    records.maxWeight !== null || records.maxE1rm !== null || records.maxSessionVolume !== null;

  if (!hasAny) {
    return null;
  }

  return (
    <section className="mt-6">
      <SectionLabel>Rekordy</SectionLabel>
      <div className="flex gap-2">
        <RecordTile
          label="Ciężar"
          value={records.maxWeight === null ? null : formatWeight(records.maxWeight.value)}
        />
        <RecordTile
          label="e1RM"
          value={records.maxE1rm === null ? null : formatWeight(records.maxE1rm.value)}
        />
        <RecordTile
          label="Objętość"
          value={
            records.maxSessionVolume === null
              ? null
              : formatVolume(records.maxSessionVolume.value)
          }
        />
      </div>

      {repRanges.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {repRanges.map(([key, entry]) => (
            <li
              key={key}
              className="rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-2"
            >
              <span className="meta">{REP_RANGE_LABELS[key]} powt.</span>{" "}
              <span className="font-semibold tabular-nums text-ink">
                {formatWeight(entry.value)} kg
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordTile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 flex-1 rounded-card border border-hairline bg-surface px-1.5 py-3 text-center">
      <p className="num num-lg truncate" style={value === null ? undefined : { color: "var(--pr)" }}>
        {value ?? "—"}
      </p>
      <p className="label-caps mt-1 truncate">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Kolumny tabel pod wykresami
 * ------------------------------------------------------------------ */

const WEIGHT_COLUMNS: readonly ChartTableColumn<WeightPoint>[] = [
  { key: "date", header: "Data", cell: (row) => formatSessionDate(row.startedAt) },
  { key: "weight", header: "Ciężar", numeric: true, cell: (row) => formatWeight(row.weightKg) },
  { key: "reps", header: "Powt.", numeric: true, cell: (row) => row.reps },
  { key: "rpe", header: "RPE", numeric: true, cell: (row) => row.rpe ?? "—" },
];

const E1RM_COLUMNS: readonly ChartTableColumn<E1rmPoint>[] = [
  { key: "date", header: "Data", cell: (row) => formatSessionDate(row.startedAt) },
  { key: "e1rm", header: "e1RM", numeric: true, cell: (row) => formatWeight(row.e1rmKg) },
];

const VOLUME_COLUMNS: readonly ChartTableColumn<VolumePoint>[] = [
  { key: "date", header: "Data", cell: (row) => formatSessionDate(row.startedAt) },
  { key: "volume", header: "Objętość", numeric: true, cell: (row) => formatVolume(row.volumeKg) },
];
