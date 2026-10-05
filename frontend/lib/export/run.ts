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
 * Running the export: Dexie → dataset → workbook → file.
 *
 * The source is the LOCAL database, because after the first sync it holds
 * the full history (`since: null` = full pull). Before we build the file,
 * though, we try to sync: without that, an export run right after a workout
 * from another device would miss that session and nobody would notice —
 * the file would look complete.
 *
 * A failed sync (no signal) does NOT abort the export. That is the whole
 * advantage of the local variant: the file is produced in a basement
 * without network too, using only the data on the device.
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

/** Hands the file to the browser. Separate from building so `runExport` is testable. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking right after the click can cut off the download in Safari —
  // hence the one-event-frame deferral.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
