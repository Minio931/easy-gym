"use client";

import { useId, useState, type ReactNode } from "react";
import { CHART_RANGES, type ChartRange } from "@/lib/charts";

/**
 * Kafel wykresu (DESIGN §7.6): nagłówek z tytułem i wartością bieżącą, rząd
 * pigułek zakresu, wykres, a pod nim przełącznik „Tabela".
 *
 * Tabela nie jest dodatkiem dla porządku. Jest jednocześnie trybem dostępnym
 * (wykres SVG czytnik ekranu odda jako nic) i **sposobem na odczytanie liczby
 * bez celowania palcem w punkt** — na telefonie w hali to jedyny pewny sposób
 * sprawdzenia, ile dokładnie było w tamtej sesji (DESIGN §10).
 */

export interface ChartTableColumn<T> {
  key: string;
  header: string;
  /** `true` = kolumna liczbowa: wyrównanie do prawej i `tabular-nums`. */
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
  /** Wartość bieżąca po prawej stronie nagłówka; `null` gdy nie ma danych. */
  value?: ReactNode;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  columns: readonly ChartTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  /**
   * Podzbiór zakresów. Domyślnie wszystkie; pulpit podaje krótszą listę, bo
   * 53 słupki tygodniowe na 390 px to nie wykres, tylko szara plama.
   */
  ranges?: readonly { key: ChartRange; label: string }[];
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const panelId = useId();
  const isEmpty = rows.length === 0;

  return (
    // `aria-label` daje sekcji rolę `region` i stabilną nazwę. Bez tego kafel
    // da się wskazać tylko po tekście, a ten sam wyraz („Ciężar") jest i w
    // tytule kafla, i w kafelku rekordu — czytnik ekranu i test trafiają wtedy
    // w cokolwiek.
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
              // Aktywny zakres w akcencie (DESIGN §7.6) -- inaczej niż zwykła
              // `Pill`, która oznacza znacznik serii i ma zostać stonowana.
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
    // Najnowsze u góry: w tabeli czyta się od góry, a na wykresie czas biegnie
    // w prawo -- odwrócenie kolejności jest tu zgodne z oczekiwaniem, nie wbrew.
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
