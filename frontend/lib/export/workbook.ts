import type { Workbook, Worksheet } from "exceljs";
import type {
  ExportDataset,
  ProgressRow,
  SetRow,
  WeeklyWeightRow,
  WorkoutRow,
} from "@/lib/export/dataset";
import { parseIsoDate } from "@/lib/metrics";

/**
 * .xlsx workbook per PROMPT §7. Six sheets, frozen filtered header,
 * number formats instead of text, PR rows highlighted, negative deltas in
 * red and positive ones in green.
 *
 * The "Serie" sheet is a flat SOURCE for a pivot table: one row = one set,
 * zero merged cells, and the data range is named `Serie_Dane`, so the
 * pivot can be inserted without mouse-selecting anything.
 *
 * ExcelJS cannot produce native Excel charts — that is why the file has
 * none, and that is why the source sheet matters here most: the chart is
 * built by Excel from the pivot table and stays LIVE, unlike a pasted
 * image.
 */

/** `dd.mm.yyyy`, `0.00 "kg"`, percentages — PROMPT §7. */
const DATE_FORMAT = "dd.mm.yyyy";
const WEIGHT_FORMAT = '0.00 "kg"';
/**
 * Percent as a quoted literal, NOT the `0.0%` format.
 * `lib/metrics.ts` returns values already multiplied (45 = 45%), and
 * Excel's percent format would multiply by one hundred again and show
 * "4500.0%".
 */
const PERCENT_FORMAT = '0.0"%"';
const VOLUME_FORMAT = '# ##0 "kg"';

const HEADER_FILL = "FF1F2937";
const PR_FILL = "FFFFF3D6";
const POSITIVE = "FF1B7F3B";
const NEGATIVE = "FFC0392B";

interface Column {
  header: string;
  key: string;
  width: number;
  style?: { numFmt?: string };
}

export async function buildWorkbook(data: ExportDataset): Promise<Workbook> {
  // Dynamic import: ExcelJS weighs more than the rest of the app, and
  // there is no reason to pull it into the workout-screen bundle.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "easy-gym";
  workbook.created = new Date();

  buildSummarySheet(workbook, data);
  buildWorkoutsSheet(workbook, data.workouts);
  buildSetsSheet(workbook, data.sets);
  buildProgressSheet(workbook, data.progress);
  buildBodyWeightSheet(workbook, data);
  buildWeeklyWeightSheet(workbook, data.weeklyWeight);

  return workbook;
}

/* ------------------------------------------------------------------ *
 * 1. Podsumowanie
 * ------------------------------------------------------------------ */

function buildSummarySheet(workbook: Workbook, data: ExportDataset): void {
  const sheet = workbook.addWorksheet("Podsumowanie");
  const { summary } = data;

  sheet.columns = [
    { key: "label", width: 28 },
    { key: "value", width: 22 },
    { key: "extra", width: 16 },
  ];

  addTitle(sheet, "Zakres i liczby");
  addPair(sheet, "Od", summary.from === null ? "cała historia" : parseIsoDate(summary.from), DATE_FORMAT);
  addPair(sheet, "Do", summary.to === null ? "cała historia" : parseIsoDate(summary.to), DATE_FORMAT);
  addPair(sheet, "Treningi", summary.workoutCount);
  addPair(sheet, "Serie robocze", summary.workingSetCount);
  addPair(sheet, "Łączna objętość", summary.totalVolumeKg, VOLUME_FORMAT);

  sheet.addRow([]);
  addTitle(sheet, "Waga ciała");
  addPair(sheet, "Na start", summary.bodyWeightStartKg ?? "brak pomiarów", WEIGHT_FORMAT);
  addPair(sheet, "Na koniec", summary.bodyWeightEndKg ?? "brak pomiarów", WEIGHT_FORMAT);
  const deltaRow = addPair(sheet, "Zmiana", summary.bodyWeightDeltaKg ?? "—", WEIGHT_FORMAT);
  colourDelta(deltaRow.getCell(2), summary.bodyWeightDeltaKg);

  sheet.addRow([]);
  addTitle(sheet, "Rekordy w zakresie");
  if (summary.records.length === 0) {
    sheet.addRow(["Brak serii roboczych w tym zakresie."]);
    return;
  }
  const header = sheet.addRow(["Ćwiczenie", "Kategoria", "Wartość"]);
  styleHeader(header);
  for (const record of summary.records) {
    const row = sheet.addRow([record.exerciseName, record.category, record.value]);
    row.getCell(3).numFmt = WEIGHT_FORMAT;
  }
}

function addTitle(sheet: Worksheet, text: string): void {
  const row = sheet.addRow([text]);
  row.getCell(1).font = { bold: true, size: 12 };
}

function addPair(sheet: Worksheet, label: string, value: unknown, numFmt?: string) {
  const row = sheet.addRow([label, value as never]);
  if (numFmt !== undefined && typeof value === "number") {
    row.getCell(2).numFmt = numFmt;
  }
  if (numFmt === DATE_FORMAT && value instanceof Date) {
    row.getCell(2).numFmt = DATE_FORMAT;
  }
  return row;
}

/* ------------------------------------------------------------------ *
 * 2. Treningi
 * ------------------------------------------------------------------ */

function buildWorkoutsSheet(workbook: Workbook, workouts: readonly WorkoutRow[]): void {
  const sheet = workbook.addWorksheet("Treningi");
  setColumns(sheet, [
    { header: "Data", key: "date", width: 12, style: { numFmt: DATE_FORMAT } },
    { header: "Dzień", key: "weekday", width: 14 },
    { header: "Czas", key: "duration", width: 10 },
    { header: "Ćwiczenia", key: "exercises", width: 46 },
    { header: "Serie", key: "sets", width: 8 },
    { header: "Objętość", key: "volume", width: 14, style: { numFmt: VOLUME_FORMAT } },
    { header: "Deload", key: "deload", width: 9 },
  ]);

  for (const workout of workouts) {
    sheet.addRow([
      parseIsoDate(workout.date),
      workout.weekday,
      workout.durationSeconds === null ? "—" : formatDuration(workout.durationSeconds),
      workout.exerciseNames,
      workout.setCount,
      workout.volumeKg,
      workout.isDeload ? "tak" : "",
    ]);
  }
  finishSheet(sheet);
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours)}:${String(minutes).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * 3. Sets — source for the pivot table
 * ------------------------------------------------------------------ */

function buildSetsSheet(workbook: Workbook, sets: readonly SetRow[]): void {
  const sheet = workbook.addWorksheet("Serie");
  setColumns(sheet, [
    { header: "Data", key: "date", width: 12, style: { numFmt: DATE_FORMAT } },
    { header: "Ćwiczenie", key: "exercise", width: 32 },
    { header: "Grupa mięśniowa", key: "muscle", width: 18 },
    { header: "Nr serii", key: "index", width: 9 },
    { header: "Ciężar", key: "weight", width: 12, style: { numFmt: WEIGHT_FORMAT } },
    { header: "Powtórzenia", key: "reps", width: 13 },
    { header: "RPE", key: "rpe", width: 7 },
    { header: "Objętość", key: "volume", width: 12, style: { numFmt: VOLUME_FORMAT } },
    { header: "e1RM", key: "e1rm", width: 12, style: { numFmt: WEIGHT_FORMAT } },
    { header: "Rozgrzewka", key: "warmup", width: 12 },
    { header: "PR", key: "pr", width: 6 },
  ]);

  for (const set of sets) {
    const row = sheet.addRow([
      parseIsoDate(set.date),
      set.exerciseName,
      set.muscleGroup,
      set.setIndex,
      set.weightKg,
      set.reps,
      set.rpe ?? "",
      set.volumeKg,
      set.e1rmKg ?? "",
      set.isWarmup ? "tak" : "",
      set.isPersonalRecord ? "tak" : "",
    ]);
    if (set.isPersonalRecord) {
      // Highlight the WHOLE row, not only the "PR" cell: a pivot table
      // will keep the column anyway, but in the raw sheet the record
      // should be visible while scrolling.
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PR_FILL } };
      });
    }
  }

  finishSheet(sheet);

  // Named range for the pivot table: `Insert → PivotTable` accepts
  // `Serie_Dane` typed by hand, without mouse-selecting thousands of rows.
  if (sets.length > 0) {
    const lastColumn = "K";
    workbook.definedNames.add(
      `Serie!$A$1:$${lastColumn}$${String(sets.length + 1)}`,
      "Serie_Dane",
    );
  }
}

/* ------------------------------------------------------------------ *
 * 4. Exercise progress
 * ------------------------------------------------------------------ */

function buildProgressSheet(workbook: Workbook, progress: readonly ProgressRow[]): void {
  const sheet = workbook.addWorksheet("Progres");
  setColumns(sheet, [
    { header: "Ćwiczenie", key: "exercise", width: 32 },
    { header: "Grupa mięśniowa", key: "muscle", width: 18 },
    { header: "Pierwszy trening", key: "firstDate", width: 16, style: { numFmt: DATE_FORMAT } },
    { header: "Pierwszy wynik", key: "first", width: 16 },
    { header: "Ostatni trening", key: "lastDate", width: 16, style: { numFmt: DATE_FORMAT } },
    { header: "Ostatni wynik", key: "last", width: 16 },
    { header: "Najlepszy ciężar", key: "bestWeight", width: 17, style: { numFmt: WEIGHT_FORMAT } },
    { header: "Najlepszy e1RM", key: "bestE1rm", width: 16, style: { numFmt: WEIGHT_FORMAT } },
    { header: "Przyrost", key: "gainKg", width: 12, style: { numFmt: WEIGHT_FORMAT } },
    { header: "Przyrost %", key: "gainPercent", width: 12, style: { numFmt: PERCENT_FORMAT } },
  ]);

  for (const row of progress) {
    const added = sheet.addRow([
      row.exerciseName,
      row.muscleGroup,
      parseIsoDate(row.firstDate),
      `${format2(row.firstWeightKg)} × ${String(row.firstReps)}`,
      parseIsoDate(row.lastDate),
      `${format2(row.lastWeightKg)} × ${String(row.lastReps)}`,
      row.bestWeightKg,
      row.bestE1rmKg ?? "",
      row.gainKg,
      row.gainPercent ?? "",
    ]);
    colourDelta(added.getCell(9), row.gainKg);
    colourDelta(added.getCell(10), row.gainPercent);
  }
  finishSheet(sheet);
}

function format2(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "");
}

/* ------------------------------------------------------------------ *
 * 5. and 6. Body weight
 * ------------------------------------------------------------------ */

function buildBodyWeightSheet(workbook: Workbook, data: ExportDataset): void {
  const sheet = workbook.addWorksheet("Waga ciała");
  setColumns(sheet, [
    { header: "Data", key: "date", width: 12, style: { numFmt: DATE_FORMAT } },
    { header: "Waga", key: "weight", width: 12, style: { numFmt: WEIGHT_FORMAT } },
    { header: "Średnia 7 dni", key: "rolling", width: 15, style: { numFmt: WEIGHT_FORMAT } },
  ]);
  for (const row of data.bodyWeight) {
    sheet.addRow([parseIsoDate(row.date), row.weightKg, row.rollingSevenDayKg ?? ""]);
  }
  finishSheet(sheet);
}

function buildWeeklyWeightSheet(workbook: Workbook, weeks: readonly WeeklyWeightRow[]): void {
  const sheet = workbook.addWorksheet("Waga tygodniowo");
  setColumns(sheet, [
    { header: "Rok", key: "year", width: 8 },
    { header: "Tydzień", key: "week", width: 10 },
    { header: "Od", key: "from", width: 12, style: { numFmt: DATE_FORMAT } },
    { header: "Do", key: "to", width: 12, style: { numFmt: DATE_FORMAT } },
    { header: "Pomiary", key: "count", width: 10 },
    { header: "Średnia", key: "average", width: 12, style: { numFmt: WEIGHT_FORMAT } },
    { header: "Zmiana", key: "deltaKg", width: 12, style: { numFmt: WEIGHT_FORMAT } },
    { header: "Zmiana %", key: "deltaPercent", width: 12, style: { numFmt: PERCENT_FORMAT } },
  ]);

  for (const week of weeks) {
    const row = sheet.addRow([
      week.year,
      week.week,
      parseIsoDate(week.from),
      parseIsoDate(week.to),
      week.measurementCount,
      week.averageKg,
      week.deltaKg ?? "",
      week.deltaPercent ?? "",
    ]);
    colourDelta(row.getCell(7), week.deltaKg);
    colourDelta(row.getCell(8), week.deltaPercent);
  }
  finishSheet(sheet);
}

/* ------------------------------------------------------------------ *
 * Shared formatting
 * ------------------------------------------------------------------ */

function setColumns(sheet: Worksheet, columns: readonly Column[]): void {
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
    style: column.style,
  }));
  styleHeader(sheet.getRow(1));
}

function styleHeader(row: ReturnType<Worksheet["getRow"]>): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });
}

function finishSheet(sheet: Worksheet): void {
  // Frozen header + autofilter: a sheet with a thousand sets is unreadable
  // after the first scroll without it.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const lastColumn = sheet.columnCount;
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: lastColumn },
  };
}

/** Negative in red, positive in green (PROMPT §7); zero and missing uncolored. */
function colourDelta(cell: { font?: unknown }, value: number | null): void {
  if (value === null || value === 0) {
    return;
  }
  cell.font = { bold: true, color: { argb: value > 0 ? POSITIVE : NEGATIVE } };
}
