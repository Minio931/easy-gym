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
 * Skoroszyt .xlsx wg PROMPT §7. Sześć arkuszy, nagłówek zamrożony i z filtrem,
 * formaty liczbowe zamiast tekstu, wiersze PR podświetlone, delty ujemne na
 * czerwono i dodatnie na zielono.
 *
 * Arkusz „Serie” jest płaskim ŹRÓDŁEM pod tabelę przestawną: jeden wiersz =
 * jedna seria, zero scalanych komórek, a zakres danych dostaje nazwę
 * `Serie_Dane`, żeby pivot dało się wstawić bez zaznaczania myszą.
 *
 * ExcelJS nie umie natywnych wykresów Excela — dlatego w pliku ich nie ma
 * i dlatego arkusz źródłowy jest tu najważniejszy: wykres robi Excel z tabeli
 * przestawnej i pozostaje ŻYWY, w odróżnieniu od wklejonego obrazka.
 */

/** `dd.mm.yyyy`, `0.00 "kg"`, procenty — PROMPT §7. */
const DATE_FORMAT = "dd.mm.yyyy";
const WEIGHT_FORMAT = '0.00 "kg"';
/**
 * Procent jako literał w cudzysłowie, NIE format `0.0%`.
 * `lib/metrics.ts` oddaje wartości już przemnożone (45 = 45%), a Excelowy
 * format procentowy mnoży przez sto jeszcze raz i pokazałby „4500,0%".
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
  // Dynamiczny import: ExcelJS waży więcej niż cała reszta apki i nie ma go
  // po co wciągać do bundla ekranu treningu.
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
 * 3. Serie — źródło pod tabelę przestawną
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
      // Podświetlenie CAŁEGO wiersza, nie samej komórki „PR": w tabeli
      // przestawnej i tak zostanie kolumna, ale w surowym arkuszu rekord ma
      // być widoczny przy przewijaniu.
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PR_FILL } };
      });
    }
  }

  finishSheet(sheet);

  // Nazwany zakres pod tabelę przestawną: `Wstaw → Tabela przestawna` przyjmuje
  // `Serie_Dane` wpisane z palca, bez zaznaczania tysięcy wierszy myszą.
  if (sets.length > 0) {
    const lastColumn = "K";
    workbook.definedNames.add(
      `Serie!$A$1:$${lastColumn}$${String(sets.length + 1)}`,
      "Serie_Dane",
    );
  }
}

/* ------------------------------------------------------------------ *
 * 4. Progres ćwiczeń
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
 * 5. i 6. Waga ciała
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
 * Wspólne formatowanie
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
  // Zamrożony nagłówek + autofiltr: arkusz z tysiącem serii bez tego jest
  // nie do czytania po pierwszym przewinięciu.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const lastColumn = sheet.columnCount;
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: lastColumn },
  };
}

/** Ujemne na czerwono, dodatnie na zielono (PROMPT §7); zero i brak bez koloru. */
function colourDelta(cell: { font?: unknown }, value: number | null): void {
  if (value === null || value === 0) {
    return;
  }
  cell.font = { bold: true, color: { argb: value > 0 ? POSITIVE : NEGATIVE } };
}
