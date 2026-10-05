"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChartTile, type ChartTableColumn } from "@/components/charts/chart-tile";
import { VolumeLegend, WeeklyVolumeChart } from "@/components/charts/volume-chart";
import { WorkoutCalendar } from "@/components/dashboard/workout-calendar";
import { EmptyState, Screen, SectionLabel, Skeleton, Tile } from "@/components/ui/screen";
import { getDashboard } from "@/lib/api/dashboard";
import { OfflineError, isAbortError, messageForUser } from "@/lib/api/errors";
import { DEFAULT_CHART_RANGE, filterByRange, type ChartRange } from "@/lib/charts";
import { buildCalendar } from "@/lib/dashboard/calendar";
import { DASHBOARD_RANGES, DASHBOARD_WEEKS, dashboardDates } from "@/lib/dashboard/range";
import {
  activeBuckets,
  fillMissingWeeks,
  muscleGroupTotals,
  volumeRows,
  type VolumeRow,
} from "@/lib/dashboard/volume";
import { formatLongDate, formatVolume, formatWeight } from "@/lib/format";
import type { DashboardResponse, RecentPersonalRecordResponse } from "@/types/api";

/**
 * Pulpit (PROMPT §11 etap 8).
 *
 * All aggregates come precomputed from the database in one request — the
 * browser does not pull sets to sum them (PROMPT §9). The fetch range is
 * fixed (`DASHBOARD_WEEKS`), and the pills above the chart filter what is
 * already in memory: at the gym, flipping "3M → 1M" cannot wait for the
 * network.
 *
 * The exception is `includeDeload` — the server computes the trend, so
 * the toggle means a new request. A deliberate cost: how the trend is
 * computed is a question asked once every few weeks, not on every look.
 */

export function DashboardScreen() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);
  const [includeDeload, setIncludeDeload] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getDashboard({ weeks: DASHBOARD_WEEKS, includeDeload, signal: controller.signal })
      .then((response) => {
        setData(response);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (isAbortError(cause)) {
          return;
        }
        // The generic offline message ("data will be sent") is a lie
        // here: the dashboard sends nothing, it just has nothing to
        // assemble from. The database computes the aggregates
        // (PROMPT §9), so offline the dashboard stays empty — unlike the
        // workout, history and weight screens, which run from Dexie.
        setError(
          cause instanceof OfflineError
            ? "Pulpit liczy serwer, więc bez zasięgu nie ma z czego go złożyć. Trening, historia i waga działają dalej."
            : messageForUser(cause),
        );
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [includeDeload]);

  const dates = useMemo(
    () => (data === null ? null : dashboardDates(data.from, data.to)),
    [data],
  );

  const chart = useMemo(() => {
    if (data === null || dates === null) {
      return { rows: [], buckets: [], groups: [] };
    }
    const weeks = filterByRange(
      fillMissingWeeks(data.weeklyVolume, dates.from, dates.to),
      range,
      new Date(),
      (week) => week.to,
    );
    const rows = volumeRows(weeks);
    // A range of all zeros gives Recharts a degenerate domain [0, 0]:
    // the axis disappears, the week numbers disappear and the tile looks
    // broken or still loading. Empty `rows` are the explicit truth here —
    // the tile says "no workouts in this range" instead of drawing an
    // empty frame.
    const hasVolume = rows.some((row) => row.totalKg > 0);
    return {
      rows: hasVolume ? rows : [],
      buckets: hasVolume ? activeBuckets(rows) : [],
      groups: hasVolume ? muscleGroupTotals(weeks) : [],
    };
  }, [data, dates, range]);

  if (loading && data === null) {
    return (
      <Screen>
        <SectionLabel>Pulpit</SectionLabel>
        <Skeleton className="mb-3 h-20 w-full" />
        <Skeleton className="mb-3 h-72 w-full" />
        <Skeleton className="h-32 w-full" />
      </Screen>
    );
  }

  if (data === null || dates === null) {
    return (
      <Screen>
        <SectionLabel>Pulpit</SectionLabel>
        <EmptyState message={error ?? "Nie udało się wczytać pulpitu."} />
      </Screen>
    );
  }

  const { totals } = data;

  if (totals.workoutCount === 0) {
    return (
      <Screen>
        <SectionLabel>Pulpit</SectionLabel>
        <EmptyState
          message="Nie ma jeszcze żadnych danych. Wykresy objętości, kalendarz treningów i ostatnie rekordy pojawią się tu po pierwszej sesji."
          action={
            <Link
              href="/trening"
              className="h-control inline-flex items-center rounded-control bg-cta px-5 font-semibold text-cta-ink"
            >
              Rozpocznij trening
            </Link>
          }
        />
        <BodyWeightCard stats={data.bodyWeight} />
      </Screen>
    );
  }

  const rangeHint = `${formatShortDate(dates.from)}–${formatShortDate(dates.to)}`;

  return (
    <Screen>
      <SectionLabel>Pulpit</SectionLabel>

      {error !== null && <p className="meta mb-2">{error}</p>}

      <div className="flex gap-2">
        <Tile label="Treningi" value={String(totals.workoutCount)} hint={rangeHint} />
        <Tile label="Serie" value={String(totals.workingSetCount)} hint="bez rozgrzewki" />
        <Tile label="Objętość" value={formatVolume(totals.volumeKg)} hint="kg" />
      </div>

      <VolumeTrend
        trend={data.volumeTrend}
        includeDeload={includeDeload}
        onIncludeDeloadChange={setIncludeDeload}
      />

      <div className="mt-6">
        <ChartTile<VolumeRow>
          title="Objętość tygodniowa"
          value={
            chart.rows.length === 0
              ? null
              : `${formatVolume(chart.rows[chart.rows.length - 1].totalKg)} kg`
          }
          range={range}
          onRangeChange={setRange}
          ranges={DASHBOARD_RANGES}
          rows={chart.rows}
          rowKey={(row) => `${String(row.year)}-${String(row.week)}`}
          emptyMessage="Brak treningów w tym zakresie."
          columns={VOLUME_COLUMNS}
        >
          <WeeklyVolumeChart rows={chart.rows} buckets={chart.buckets} />
        </ChartTile>
        <VolumeLegend buckets={chart.buckets} />
        {chart.buckets.length > 0 && (
          <p className="meta mt-1">
            Podkreślenie pod słupkiem = tydzień deload. Kolor idzie za grupą, nie za pozycją
            w słupku.
          </p>
        )}
        <MuscleGroupBreakdown groups={chart.groups} />
      </div>

      <section className="mt-8">
        <SectionLabel>Kalendarz treningów</SectionLabel>
        <WorkoutCalendar
          grid={buildCalendar(data.workoutDays, dates.from, dates.to)}
          totalWorkouts={totals.workoutCount}
        />
        <MonthlyWorkouts months={data.workoutsPerMonth} />
      </section>

      <RecentRecords records={data.recentPersonalRecords} />

      <BodyWeightCard stats={data.bodyWeight} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * Volume trend
 * ------------------------------------------------------------------ */

function VolumeTrend({
  trend,
  includeDeload,
  onIncludeDeloadChange,
}: {
  trend: DashboardResponse["volumeTrend"];
  includeDeload: boolean;
  onIncludeDeloadChange: (value: boolean) => void;
}) {
  return (
    <div className="mt-3 rounded-card border border-hairline bg-surface p-4">
      <p className="label-caps">Tydzień do tygodnia</p>
      {trend === null || trend.deltaPercent === null ? (
        <p className="mt-1 text-ink-2">
          Za mało tygodni z treningiem, żeby cokolwiek porównać.
        </p>
      ) : (
        <p className="mt-1">
          <span className="num num-lg">
            {trend.deltaPercent > 0 ? "+" : ""}
            {trend.deltaPercent}%
          </span>{" "}
          <span className="meta">
            {formatVolume(trend.previousKg)} → {formatVolume(trend.currentKg)} kg
          </span>
        </p>
      )}

      {/* PROMPT §5: trend musi dać się policzyć z deloadami i bez. Domyślnie
          bez — inaczej każdy powrót po lekkim tygodniu wygląda na skok formy,
          a to jest dokładnie ten wykres, na który patrzy się przy decyzji
          „dokładam czy odpuszczam". */}
      <button
        type="button"
        aria-pressed={includeDeload}
        onClick={() => {
          onIncludeDeloadChange(!includeDeload);
        }}
        className={[
          "mt-3 h-touch inline-flex items-center rounded-full border px-3 text-[13px] font-semibold",
          includeDeload ? "border-transparent" : "border-hairline text-ink-3",
        ].join(" ")}
        style={
          includeDeload ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined
        }
      >
        Licz tygodnie deload
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Rozbicie na grupy
 * ------------------------------------------------------------------ */

function MuscleGroupBreakdown({
  groups,
}: {
  groups: readonly { group: string; kg: number; share: number }[];
}) {
  if (groups.length === 0) {
    return null;
  }
  return (
    <details className="mt-3 rounded-card border border-hairline bg-surface px-4 py-3">
      {/* Pełne rozbicie (w bazie jest 11 grup) należy do tabeli, nie do wykresu:
          slotów palety jest 8 i zapętlanie ich jest zabronione (DESIGN §3.4). */}
      <summary className="label-caps cursor-pointer">Wszystkie grupy mięśniowe</summary>
      <table className="mt-2 w-full text-[13px]">
        <thead>
          <tr>
            <th scope="col" className="label-caps py-1 text-left">
              Grupa
            </th>
            <th scope="col" className="label-caps py-1 text-right">
              Objętość
            </th>
            <th scope="col" className="label-caps py-1 text-right">
              Udział
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((entry) => (
            <tr key={entry.group} className="border-t border-hairline">
              <td className="py-1.5 text-ink-2">{entry.group}</td>
              <td className="py-1.5 text-right tabular-nums text-ink">{formatVolume(entry.kg)}</td>
              <td className="py-1.5 text-right tabular-nums text-ink-2">
                {Math.round(entry.share * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/* ------------------------------------------------------------------ *
 * Workouts per month
 * ------------------------------------------------------------------ */

function MonthlyWorkouts({ months }: { months: DashboardResponse["workoutsPerMonth"] }) {
  if (months.length === 0) {
    return null;
  }
  const max = Math.max(...months.map((month) => month.workoutCount));

  return (
    <div className="mt-3 rounded-card border border-hairline bg-surface px-4 py-3">
      <p className="label-caps mb-1">Treningi w miesiącach</p>
      <ul>
      {months.map((month) => (
        <li key={month.month} className="flex items-center gap-3 py-1">
          <span className="meta w-16 shrink-0">{formatMonth(month.month)}</span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${String(max === 0 ? 0 : (month.workoutCount / max) * 100)}%`,
                background: "var(--series-1)",
              }}
            />
          </span>
          <span className="num shrink-0 tabular-nums text-ink">{month.workoutCount}</span>
        </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Ostatnie rekordy
 * ------------------------------------------------------------------ */

function RecentRecords({ records }: { records: readonly RecentPersonalRecordResponse[] }) {
  if (records.length === 0) {
    return null;
  }
  return (
    <section className="mt-8">
      <SectionLabel>Ostatnie rekordy</SectionLabel>
      <ul className="overflow-hidden rounded-card border border-hairline bg-surface">
        {records.map((record, index) => (
          <li key={record.setId} className={index === 0 ? "" : "border-t border-hairline"}>
            <Link
              href={`/cwiczenie/${record.exerciseId}`}
              className="flex items-center gap-3 px-4 py-3 active:bg-surface-2"
            >
              <span
                aria-hidden="true"
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ background: "var(--pr-wash)", color: "var(--pr)" }}
              >
                PR
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{record.exerciseName}</span>
                <span className="meta block truncate">{formatLongDate(record.achievedAt)}</span>
              </span>
              <span className="num num-md shrink-0 tabular-nums text-ink">
                {formatWeight(record.weightKg)} <span className="meta">kg</span> ×{" "}
                {record.reps}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Body weight — shortcut
 * ------------------------------------------------------------------ */

function BodyWeightCard({ stats }: { stats: DashboardResponse["bodyWeight"] }) {
  const latestWeek = stats.weekly.at(-1) ?? null;

  return (
    <section className="mt-8">
      <SectionLabel>Waga ciała</SectionLabel>
      <Link
        href="/waga"
        className="flex items-center gap-3 rounded-card border border-hairline bg-surface px-4 py-3 active:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="num num-lg block">
            {stats.latest === null ? "—" : `${formatWeight(stats.latest.weightKg)} kg`}
          </span>
          <span className="meta block truncate">
            {stats.latest === null
              ? "Brak pomiarów — wpisz dzisiejszą wagę"
              : `Ostatni pomiar: ${formatDayMonthYear(stats.latest.measuredOn)}`}
          </span>
        </span>
        {latestWeek?.deltaKg !== null && latestWeek?.deltaKg !== undefined && (
          <span className="num num-md shrink-0 tabular-nums text-ink-2">
            {latestWeek.deltaKg > 0 ? "+" : ""}
            {formatWeight(latestWeek.deltaKg)} kg / tydz.
          </span>
        )}
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Format
 * ------------------------------------------------------------------ */

/** `YYYY-MM-DD` → `17.09`. No `Date`: this is a calendar day, not an instant. */
function formatShortDate(isoDate: string): string {
  return `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}`;
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("pl-PL", {
    month: "short",
    year: "2-digit",
  });
}

/** `2026-09-17` → `17.09.2026`. */
function formatDayMonthYear(isoDate: string): string {
  return `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}.${isoDate.slice(0, 4)}`;
}

const VOLUME_COLUMNS: readonly ChartTableColumn<VolumeRow>[] = [
  {
    key: "week",
    header: "Tydzień",
    // Deload as TEXT, not just an underline on the chart (DESIGN §9).
    // In a separate column it collapsed to a one-char bar "—", squeezed
    // next to the workout count as "0—".
    cell: (row) =>
      `${String(row.week)}/${String(row.year)}${row.isDeload ? " · deload" : ""}`,
  },
  { key: "volume", header: "Objętość", numeric: true, cell: (row) => formatVolume(row.totalKg) },
  { key: "workouts", header: "Treningi", numeric: true, cell: (row) => row.workoutCount },
];
