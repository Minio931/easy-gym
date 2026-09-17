import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { NO_FILTERS, buildExportDataset, type ExportSource } from "@/lib/export/dataset";
import { buildWorkbook } from "@/lib/export/workbook";

/**
 * Test czyta wygenerowany skoroszyt Z POWROTEM, zamiast sprawdzać, że kod się
 * wykonał. Formaty liczbowe, zamrożony nagłówek i nazwany zakres to rzeczy,
 * które psują się po cichu — plik powstaje, tylko jest bezużyteczny.
 */

const SOURCE: ExportSource = {
  exercises: [
    {
      id: "ex-a",
      name: "Wyciskanie",
      muscleGroup: "klatka piersiowa",
      equipment: "barbell",
      isArchived: false,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    },
  ],
  workouts: [
    {
      id: "w1",
      startedAt: "2026-05-04T10:00:00Z",
      endedAt: "2026-05-04T11:30:00Z",
      routineId: null,
      notes: null,
      isDeload: false,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    },
  ],
  workoutExercises: [
    {
      id: "we1",
      workoutId: "w1",
      exerciseId: "ex-a",
      orderIndex: 0,
      notes: null,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    },
  ],
  sets: [
    {
      id: "s1",
      workoutExerciseId: "we1",
      setIndex: 0,
      weightKg: 100,
      reps: 5,
      rpe: 8,
      isWarmup: false,
      toFailure: false,
      assisted: false,
      completedAt: "2026-05-04T10:20:00Z",
      updatedAt: "",
      deletedAt: null,
    },
  ],
  bodyWeights: [
    { id: "b1", measuredOn: "2026-05-04", weightKg: 80, note: null, updatedAt: "", deletedAt: null },
    { id: "b2", measuredOn: "2026-05-12", weightKg: 79, note: null, updatedAt: "", deletedAt: null },
  ],
};

async function roundTrip(): Promise<ExcelJS.Workbook> {
  const data = buildExportDataset(SOURCE, NO_FILTERS, "epley");
  const workbook = await buildWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer as ArrayBuffer);
  return reopened;
}

describe("buildWorkbook", () => {
  it("ma sześć arkuszy z PROMPT §7, w tej kolejności", async () => {
    const workbook = await roundTrip();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Podsumowanie",
      "Treningi",
      "Serie",
      "Progres",
      "Waga ciała",
      "Waga tygodniowo",
    ]);
  });

  it("arkusz Serie jest płaskim źródłem: jeden wiersz na serię, nagłówki po polsku", async () => {
    const sheet = (await roundTrip()).getWorksheet("Serie");
    const header = sheet?.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual([
      "Data",
      "Ćwiczenie",
      "Grupa mięśniowa",
      "Nr serii",
      "Ciężar",
      "Powtórzenia",
      "RPE",
      "Objętość",
      "e1RM",
      "Rozgrzewka",
      "PR",
    ]);
    expect(sheet?.rowCount).toBe(2);
    expect(sheet?.getRow(2).getCell(2).value).toBe("Wyciskanie");
    expect(sheet?.getRow(2).getCell(5).value).toBe(100);
  });

  it("data jest DATĄ, a nie tekstem — inaczej pivot nie pogrupuje po miesiącach", async () => {
    const cell = (await roundTrip()).getWorksheet("Serie")?.getRow(2).getCell(1);
    expect(cell?.value).toBeInstanceOf(Date);
    expect(cell?.numFmt).toBe("dd.mm.yyyy");
  });

  it("ciężar ma format liczbowy z jednostką, nie doklejone „kg” w tekście", async () => {
    const cell = (await roundTrip()).getWorksheet("Serie")?.getRow(2).getCell(5);
    expect(typeof cell?.value).toBe("number");
    expect(cell?.numFmt).toBe('0.00 "kg"');
  });

  it("nagłówek jest zamrożony i ma autofiltr na każdym arkuszu z tabelą", async () => {
    const workbook = await roundTrip();
    for (const name of ["Treningi", "Serie", "Progres", "Waga ciała", "Waga tygodniowo"]) {
      const sheet = workbook.getWorksheet(name);
      expect(sheet?.views[0], name).toMatchObject({ state: "frozen", ySplit: 1 });
      expect(sheet?.autoFilter, name).toBeTruthy();
    }
  });

  it("zakres „Serie_Dane” jest nazwany i obejmuje nagłówek z wierszami", async () => {
    const workbook = await roundTrip();
    // Nazwany zakres to cały sens tego arkusza: „Wstaw → Tabela przestawna"
    // przyjmuje go wpisanego z palca, bez zaznaczania tysięcy wierszy.
    const ranges = workbook.definedNames.getRanges("Serie_Dane");
    expect(ranges.ranges.join()).toContain("Serie!");
    expect(ranges.ranges.join()).toContain("$A$1");
  });

  it("wiersz z rekordem jest podświetlony", async () => {
    const row = (await roundTrip()).getWorksheet("Serie")?.getRow(2);
    expect(row?.getCell(11).value).toBe("tak");
    expect(row?.getCell(1).fill).toMatchObject({ type: "pattern" });
  });

  it("ujemna zmiana wagi jest czerwona, a dodatnia zielona", async () => {
    const sheet = (await roundTrip()).getWorksheet("Waga tygodniowo");
    // Tydzień 20: średnia 79 kg po 80 kg w tygodniu 19 → −1 kg.
    const delta = sheet?.getRow(3).getCell(7);
    expect(delta?.value).toBeCloseTo(-1, 5);
    expect((delta?.font as { color?: { argb?: string } } | undefined)?.color?.argb).toBe("FFC0392B");
  });

  it("podsumowanie niesie zakres, liczby i rekordy", async () => {
    const sheet = (await roundTrip()).getWorksheet("Podsumowanie");
    const text = JSON.stringify(sheet?.getSheetValues());
    expect(text).toContain("Treningi");
    expect(text).toContain("Łączna objętość");
    expect(text).toContain("Najwyższy e1RM");
  });

  it("pusty zakres daje poprawny plik, nie wyjątek", async () => {
    const empty = buildExportDataset(
      { exercises: [], workouts: [], workoutExercises: [], sets: [], bodyWeights: [] },
      NO_FILTERS,
      "epley",
    );
    const workbook = await buildWorkbook(empty);
    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
