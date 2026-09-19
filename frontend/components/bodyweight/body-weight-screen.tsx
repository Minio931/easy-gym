"use client";

import { useEffect, useMemo, useState } from "react";
import { BodyWeightChart } from "@/components/charts/body-weight-chart";
import { ChartTile, type ChartTableColumn } from "@/components/charts/chart-tile";
import { EmptyState, Screen, SectionLabel, Skeleton, Tile } from "@/components/ui/screen";
import {
  rawPoints,
  weeklyPoints,
  weightDomain,
  type WeeklyWeightPoint,
} from "@/lib/bodyweight/points";
import {
  loadBodyWeights,
  removeWeight,
  saveWeight,
  useBodyWeightState,
} from "@/lib/bodyweight/store";
import { todayIsoDate, validateBodyWeightInput } from "@/lib/bodyweight/input";
import { DEFAULT_CHART_RANGE, filterByRange, type ChartRange } from "@/lib/charts";
import { formatWeight } from "@/lib/format";
import type { BodyWeightResponse } from "@/types/api";

/**
 * Ekran wagi ciała (PROMPT §5, DESIGN §10).
 *
 * Wpis jest jeden na dzień i jest EDYTOWALNY — drugie ważenie tego samego dnia
 * poprawia pierwsze, nie dokłada drugiego. Ekran mówi to wprost, zanim user
 * kliknie zapis, bo inaczej „zapisz" przy już zważonym dniu wygląda jak
 * dodawanie, a jest nadpisaniem.
 */

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pl-PL", DATE_FORMAT);
}

/** `unit` puste = sama liczba ze znakiem (kafle, gdzie jednostkę niesie podpis). */
function formatSigned(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  const suffix = unit === "" ? "" : ` ${unit}`;
  return `${sign}${formatWeight(value)}${suffix}`;
}

export function BodyWeightScreen() {
  const { status, stats, local, saving, error } = useBodyWeightState();
  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);
  const [date, setDate] = useState(() => todayIsoDate());

  useEffect(() => {
    void loadBodyWeights();
  }, []);

  const points = useMemo(() => {
    const now = new Date();
    const raw = filterByRange(rawPoints(stats?.entries ?? []), range, now, (p) => p.measuredOn);
    const weekly = filterByRange(weeklyPoints(stats?.weekly ?? []), range, now, (p) => p.to);
    return { raw, weekly, domain: weightDomain(raw, weekly) };
  }, [stats, range]);

  if (status !== "ready" && stats === null) {
    return (
      <Screen>
        <SectionLabel>Waga ciała</SectionLabel>
        <Skeleton className="mb-3 h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </Screen>
    );
  }

  const entries = stats?.entries ?? [];
  const latestWeek = stats?.weekly.at(-1) ?? null;

  return (
    <Screen>
      <SectionLabel>Waga ciała</SectionLabel>

      <WeightEntryForm entries={entries} saving={saving} date={date} onDateChange={setDate} />

      {error !== null && <p className="meta mt-2">{error}</p>}
      {local && entries.length > 0 && (
        <p className="meta mt-2">
          Liczby policzone na tym urządzeniu — po odzyskaniu sieci odświeżą się z serwera.
        </p>
      )}

      {entries.length === 0 ? (
        <div className="mt-6">
          <EmptyState message="Nie masz jeszcze żadnego pomiaru. Wpisz dzisiejszą wagę — średnia tygodniowa policzy się sama." />
        </div>
      ) : (
        <>
          <div className="mt-6 flex gap-2">
            <Tile
              label="Ostatnia"
              value={stats?.latest === null || stats?.latest === undefined
                ? "—"
                : formatWeight(stats.latest.weightKg)}
              hint={stats?.latest === null || stats?.latest === undefined
                ? undefined
                : formatDay(stats.latest.measuredOn)}
            />
            <Tile
              label="Śr. tyg."
              value={latestWeek === null ? "—" : formatWeight(latestWeek.averageKg)}
              hint={
                latestWeek === null
                  ? undefined
                  : latestWeek.incomplete
                    ? "tydzień niepełny"
                    : `${String(latestWeek.measurementCount)} pom.`
              }
            />
            <Tile
              // Etykiety i wartości muszą się zmieścić w jednej trzeciej
              // szerokości 390 px przy stopniu pisma 30 px. „Tydz. do tyg."
              // i „-0.37 kg" ucinały się na wielokropek — a ucięta liczba to
              // gorzej niż krótsza etykieta. Jednostkę niesie podpis kafla.
              label="Zmiana tyg."
              value={
                latestWeek?.deltaKg === null || latestWeek?.deltaKg === undefined
                  ? "—"
                  : formatSigned(latestWeek.deltaKg, "")
              }
              hint={
                latestWeek?.deltaPercent === null || latestWeek?.deltaPercent === undefined
                  ? undefined
                  : `${latestWeek.deltaPercent > 0 ? "+" : ""}${String(latestWeek.deltaPercent)}%`
              }
            />
          </div>

          {stats?.fourWeekTrend !== null && stats?.fourWeekTrend !== undefined && (
            <p className="meta mt-2">
              Trend 4 tygodnie: {formatSigned(stats.fourWeekTrend.deltaKg, "kg")} (
              {stats.fourWeekTrend.deltaPercent > 0 ? "+" : ""}
              {stats.fourWeekTrend.deltaPercent}%), tydzień {stats.fourWeekTrend.fromWeek} →{" "}
              {stats.fourWeekTrend.toWeek}.
            </p>
          )}

          <div className="mt-6">
            <ChartTile<WeeklyWeightPoint>
              title="Waga"
              value={
                stats?.latest === null || stats?.latest === undefined
                  ? null
                  : `${formatWeight(stats.latest.weightKg)} kg`
              }
              range={range}
              onRangeChange={setRange}
              rows={points.weekly}
              rowKey={(row) => `${String(row.year)}-${String(row.week)}`}
              emptyMessage="Brak pomiarów w tym zakresie."
              columns={WEEKLY_COLUMNS}
            >
              <BodyWeightChart
                raw={points.raw}
                weekly={points.weekly}
                domain={points.domain}
                selectedDate={date}
                onSelectDay={setDate}
              />
            </ChartTile>
            <p className="meta mt-1">
              Jasne punkty to pojedyncze ważenia, linia to średnie tygodniowe. Pusty punkt
              z obwódką = tydzień z mniej niż dwoma pomiarami.
            </p>
          </div>

          <EntryList entries={entries} />
        </>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * Wpis
 * ------------------------------------------------------------------ */

function WeightEntryForm({
  entries,
  saving,
  date,
  onDateChange,
}: {
  entries: readonly BodyWeightResponse[];
  saving: boolean;
  /** Kontrolowane z zewnątrz — kliknięcie punktu na wykresie też zmienia ten dzień. */
  date: string;
  onDateChange: (isoDate: string) => void;
}) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const existing = entries.find((entry) => entry.measuredOn === date) ?? null;
  const validation = validateBodyWeightInput(value);
  const showError = touched && validation.error !== null;

  return (
    <form
      className="rounded-card border border-hairline bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (validation.weightKg === null) {
          return;
        }
        void saveWeight(date, validation.weightKg).then((ok) => {
          if (ok) {
            setValue("");
            setTouched(false);
          }
        });
      }}
    >
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="label-caps mb-1 block">Dzień</span>
          <input
            type="date"
            value={date}
            max={todayIsoDate()}
            onChange={(event) => {
              onDateChange(event.target.value);
            }}
            className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-ink"
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="label-caps mb-1 block">Waga (kg)</span>
          <input
            // `decimal`, nie `numeric`: klawiatura numeryczna bez separatora
            // nie pozwala wpisać 80,4, a waga rzadko bywa okrągła.
            inputMode="decimal"
            value={value}
            placeholder={existing === null ? "80,0" : formatWeight(existing.weightKg)}
            onChange={(event) => {
              setValue(event.target.value);
            }}
            onBlur={() => {
              setTouched(true);
            }}
            aria-label="Waga w kilogramach"
            aria-invalid={showError}
            className="h-control w-full rounded-control border border-hairline bg-surface-2 px-3 text-right text-ink tabular-nums"
          />
        </label>
      </div>

      {existing !== null && (
        // Bez tego „Zapisz" przy już zważonym dniu wygląda jak dodawanie
        // drugiego wpisu, a jest nadpisaniem pierwszego.
        <p className="meta mt-2">
          Ten dzień ma już wpis {formatWeight(existing.weightKg)} kg — zapis go nadpisze.
        </p>
      )}
      {showError && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--critical)" }} role="alert">
          {validation.error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="mt-3 h-control w-full rounded-control bg-cta font-semibold text-cta-ink disabled:opacity-60"
      >
        {saving ? "Zapisuję…" : existing === null ? "Zapisz wagę" : "Popraw wpis"}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Lista pomiarów
 * ------------------------------------------------------------------ */

const RECENT_LIMIT = 14;

function EntryList({ entries }: { entries: readonly BodyWeightResponse[] }) {
  const recent = [...entries].reverse().slice(0, RECENT_LIMIT);

  return (
    <section className="mt-8">
      <SectionLabel>Ostatnie pomiary</SectionLabel>
      <ul className="overflow-hidden rounded-card border border-hairline bg-surface">
        {recent.map((entry, index) => (
          <li
            key={entry.id}
            className={`flex items-center gap-3 px-4 py-2.5 ${index === 0 ? "" : "border-t border-hairline"}`}
          >
            <span className="min-w-0 flex-1 truncate text-ink-2">{formatDay(entry.measuredOn)}</span>
            <span className="num num-md shrink-0 text-ink">
              {formatWeight(entry.weightKg)} <span className="meta">kg</span>
            </span>
            <button
              type="button"
              onClick={() => {
                void removeWeight(entry.id);
              }}
              aria-label={`Usuń pomiar z ${formatDay(entry.measuredOn)}`}
              className="-mr-2 flex size-touch shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {entries.length > RECENT_LIMIT && (
        <p className="meta mt-2">
          Pokazane {RECENT_LIMIT} ostatnich z {entries.length}. Wcześniejsze są na wykresie.
        </p>
      )}
    </section>
  );
}

const WEEKLY_COLUMNS: readonly ChartTableColumn<WeeklyWeightPoint>[] = [
  {
    key: "week",
    header: "Tydzień",
    cell: (row) => `${String(row.week)}/${String(row.year)}`,
  },
  { key: "avg", header: "Średnia", numeric: true, cell: (row) => formatWeight(row.averageKg) },
  { key: "count", header: "Pom.", numeric: true, cell: (row) => row.measurementCount },
  {
    key: "delta",
    header: "Zmiana",
    numeric: true,
    cell: (row) => (row.deltaKg === null ? "—" : formatSigned(row.deltaKg, "")),
  },
];
