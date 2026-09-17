import ExcelJS from "exceljs";
import { loginViaUi } from "./support/auth";
import { USER_A } from "./support/api";
import { expect, test } from "./support/fixtures";
import type { Page } from "@playwright/test";

/**
 * Etap 9: eksport do Excela.
 *
 * Test OTWIERA pobrany plik, zamiast sprawdzać, że pobranie się zdarzyło.
 * Plik, który powstaje i jest bezużyteczny (daty jako tekst, brak arkusza,
 * rozgrzewka mimo filtru), przeszedłby każdy test patrzący tylko na nazwę.
 *
 * Liczb tego konta test nie zna — historia `Minio` rośnie z każdego przebiegu
 * — więc sprawdza niezmienniki: kształt arkuszy, typy komórek i to, że filtr
 * naprawdę odcina dane.
 */

const SHEETS = ["Podsumowanie", "Treningi", "Serie", "Progres", "Waga ciała", "Waga tygodniowo"];

async function downloadWorkbook(page: Page): Promise<ExcelJS.Workbook> {
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Pobierz plik .xlsx" }).click();
  const file = await download;
  const path = await file.path();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

/** Wiersze arkusza „Serie” bez nagłówka. */
function setRows(workbook: ExcelJS.Workbook): ExcelJS.Row[] {
  const sheet = workbook.getWorksheet("Serie");
  const rows: ExcelJS.Row[] = [];
  sheet?.eachRow((row, index) => {
    if (index > 1) {
      rows.push(row);
    }
  });
  return rows;
}

test.describe("Etap 9: eksport XLSX", () => {
  test("pobrany plik ma sześć arkuszy, a daty i ciężary są liczbami", async ({ page }) => {
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/eksport");

    const workbook = await downloadWorkbook(page);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(SHEETS);

    const sheet = workbook.getWorksheet("Serie");
    expect((sheet?.getRow(1).values as unknown[]).slice(1)).toEqual([
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
    // Nagłówek zamrożony i filtrowalny — arkusz z tysiącem serii bez tego
    // jest nie do czytania po pierwszym przewinięciu.
    expect(sheet?.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet?.autoFilter).toBeTruthy();

    const rows = setRows(workbook);
    if (rows.length > 0) {
      // Data musi być DATĄ, inaczej tabela przestawna nie pogrupuje po
      // miesiącach, a ciężar liczbą, inaczej nie da się go zsumować.
      expect(rows[0].getCell(1).value).toBeInstanceOf(Date);
      expect(typeof rows[0].getCell(5).value).toBe("number");
      expect(rows[0].getCell(5).numFmt).toBe('0.00 "kg"');
    }
  });

  test("filtr „tylko serie robocze” naprawdę odcina rozgrzewkę", async ({ page }) => {
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/eksport");

    const all = setRows(await downloadWorkbook(page));

    await page.getByRole("button", { name: "Tylko serie robocze" }).click();
    await expect(page.getByRole("button", { name: "Tylko serie robocze" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const working = setRows(await downloadWorkbook(page));

    expect(working.length).toBeLessThanOrEqual(all.length);
    expect(working.some((row) => row.getCell(10).value === "tak")).toBe(false);
  });

  test("zakres dat zawęża plik i trafia do nazwy", async ({ page }) => {
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/eksport");

    const all = setRows(await downloadWorkbook(page));

    // Zakres w przyszłości względem danych konta: plik ma powstać i być pusty,
    // a nie wysypać się na braku wierszy.
    await page.getByLabel("Od").fill("2099-01-01");
    await page.getByLabel("Do").fill("2099-12-31");

    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: "Pobierz plik .xlsx" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("easy-gym-2099-01-01_2099-12-31.xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(await file.path());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(SHEETS);
    expect(setRows(workbook).length).toBe(0);
    expect(setRows(workbook).length).toBeLessThanOrEqual(all.length);
  });
});
