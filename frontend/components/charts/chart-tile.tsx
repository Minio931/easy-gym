"use client";

import { useId, useState, type ReactNode } from "react";
import { CHART_RANGES, type ChartRange } from "@/lib/charts";

/**
 * Chart tile (DESIGN §7.6): header with title and current value, row of
 * range pills, the chart, and below it a "Tabela" toggle.
 *
 * The table is not a formal add-on. It is both an accessible mode (a
 * screen reader returns nothing for an SVG chart) and **a way to read a
 * number without aiming at a point** — on a phone at the gym it is the
 * only reliable way to see exactly how much a given session had
 * (DESIGN §10).
 */

export interface ChartTableColumn<T> {
  key: string;
  header: string;
  /** `true` = numeric column: right-aligned and `tabular-nums`. */
  numeric?: boolean;
  cell: (row: T) => ReactNode;
}

export function ChartTile<T>({
  title,
  value,
  range,
  onRangeChange,
  columns,
  rows,
  rowKey,
  emptyMessage,
  ranges = CHART_RANGES,
  children,
}: {
  title: string;
  /** Current value on the right side of the header; `null` when there is no data. */
  value?: ReactNode;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  columns: readonly ChartTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  /**
   * Subset of ranges. Default: all; the dashboard passes a shorter list,
   * because 53 weekly bars at 390 px is not a chart but a gray smudge.
   */
  ranges?: readonly { key: ChartRange; label: string }[];
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const panelId = useId();
  const isEmpty = rows.length === 0;

  return (
    // `aria-label` gives the section role `region` and a stable name.
    // Without it the tile can only be addressed by text, and the same
    // word ("Ciężar") appears both in the tile title and the record tile
    // — a screen reader and test then hit whichever one.
    <section aria-label={title} className="rounded-card border border-hairline bg-surface p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="label-caps">{title}</h3>
        {value !== undefined && value !== null && (
          <span className="num-lg shrink-0 text-ink">{value}</span>
        )}
      </header>

      <div
        role="group"
        aria-label="Zakres czasu"
        className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1"
      >
        {ranges.map((option) => {
          const active = option.key === range;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onRangeChange(option.key);
              }}
              className={[
                "h-touch shrink-0 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap",
                "inline-flex items-center border transition-colors duration-[120ms] ease-out",
                active ? "border-transparent" : "border-hairline bg-transparent text-ink-3",
              ].join(" ")}
              // Active range in the accent (DESIGN §7.6) — unlike a plain
              // `Pill`, which marks a set tag and should stay toned down.
              style={
                active
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : undefined
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div id={panelId} className="mt-3">
        {isEmpty ? (
          <p className="py-10 text-center text-ink-2">{emptyMessage}</p>
        ) : showTable ? (
          <ChartTable columns={columns} rows={rows} rowKey={rowKey} />
        ) : (
          <div className="h-[200px] w-full">{children}</div>
        )}
      </div>

      {!isEmpty && (
        <button
          type="button"
          aria-expanded={showTable}
          aria-controls={panelId}
          onClick={() => {
            setShowTable((current) => !current);
          }}
          className="mt-2 h-touch text-[13px] font-semibold text-ink-2 underline underline-offset-4"
        >
          {showTable ? "Wykres" : "Tabela"}
        </button>
      )}
    </section>
  );
}

function ChartTable<T>({
  columns,
  rows,
  rowKey,
}: {
  columns: readonly ChartTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
}) {
  return (
    // Newest at the top: a table reads top-down, a chart runs time to the
    // right — reversing the order here matches expectation, not fights it.
    <div className="max-h-[260px] overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-surface">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`label-caps py-2 ${column.numeric === true ? "text-right" : "text-left"}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row) => (
            <tr key={rowKey(row)} className="border-t border-hairline">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`py-2 ${
                    column.numeric === true ? "text-right tabular-nums text-ink" : "text-ink-2"
                  }`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
