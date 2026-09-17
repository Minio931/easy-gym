"use client";

import { getDatabase } from "@/lib/db/database";
import {
  buildExportDataset,
  exportFileName,
  type ExportDataset,
  type ExportFilters,
} from "@/lib/export/dataset";
import { buildWorkbook } from "@/lib/export/workbook";
import { requestSync } from "@/lib/sync/engine";
import type { OneRepMaxFormula } from "@/lib/metrics";

/**
 * Uruchomienie eksportu: Dexie → zestaw danych → skoroszyt → plik.
 *
 * Źródłem jest LOKALNA baza, bo po pierwszej synchronizacji leży w niej komplet
 * historii (`since: null` = pełny zaciąg). Zanim jednak zbudujemy plik,
 * próbujemy się zsynchronizować: bez tego eksport zrobiony zaraz po treningu
 * na drugim urządzeniu pominąłby tamtą sesję i nikt by tego nie zauważył —
 * plik wyglądałby na kompletny.
 *
 * Nieudana synchronizacja (brak zasięgu) NIE przerywa eksportu. To jest cała
 * przewaga wariantu lokalnego: plik powstaje też w piwnicy bez sieci, tylko
 * z danymi, które są na urządzeniu.
 */

export interface ExportResult {
  fileName: string;
  blob: Blob;
  dataset: ExportDataset;
}

export class NoLocalDataError extends Error {
  constructor() {
    super("Brak lokalnej bazy — zaloguj się i poczekaj na pierwszą synchronizację.");
    this.name = "NoLocalDataError";
  }
}

export async function runExport(
  filters: ExportFilters,
  formula: OneRepMaxFormula,
  now: Date = new Date(),
): Promise<ExportResult> {
  await requestSync().catch(() => undefined);

  const db = getDatabase();
  if (db === null) {
    throw new NoLocalDataError();
  }

  const [workouts, workoutExercises, sets, exercises, bodyWeights] = await Promise.all([
    db.workouts.toArray(),
    db.workoutExercises.toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
    db.bodyWeights.toArray(),
  ]);

  const dataset = buildExportDataset(
    { workouts, workoutExercises, sets, exercises, bodyWeights },
    filters,
    formula,
  );
  const workbook = await buildWorkbook(dataset);
  const buffer = await workbook.xlsx.writeBuffer();

  return {
    fileName: exportFileName(filters, now),
    blob: new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    dataset,
  };
}

/** Oddaje plik przeglądarce. Osobno od budowania, żeby `runExport` dało się testować. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Zwolnienie od razu po kliknięciu potrafi uciąć pobieranie w Safari —
  // stąd odroczenie o jedną klatkę zdarzeń.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
