import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import { USER_A } from "./support/api";
import { startEmptyWorkoutViaUi } from "./support/workout-ui";

/**
 * §3 spec: usunięcie serii przez gest — swipe w lewo (próg 96 px, zdefiniowany
 * jako `SWIPE_THRESHOLD_PX` w `components/workout/set-row.tsx`) albo
 * long-press 500 ms (`LONG_PRESS_MS`). Oba prowadzą do tego samego miękkiego
 * usunięcia (ten sam `onDeleteSet` -> toast „Seria usunięta” + „Cofnij”) co
 * pigułka „Usuń serię” pokryta w `05-soft-delete-set.spec.ts` — tu testujemy
 * WYŁĄCZNIE same gesty, nie duplikujemy asercji o soft delete / DELETE API.
 *
 * Implementacja gestu jest oparta o Pointer Events (`onPointerDown/Move/Up`
 * z `event.clientX/clientY`) -- `page.mouse.*` w Playwright generuje realne
 * zdarzenia pointer w Chromium, więc to jest test rzeczywistego gestu, nie
 * symulacja na skróty.
 */
test.describe("Usunięcie serii gestem: swipe i long-press", () => {
  test.beforeEach(async ({ page, userAToken }) => {
    void userAToken;
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");
    await startEmptyWorkoutViaUi(page);
    await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();

    const searchBox = page.getByRole("textbox").first();
    await searchBox.fill("wiosłowanie");
    await page.waitForResponse((res) => res.url().includes("/api/exercises?query="));
    await page.getByText(/wiosłowanie|wioślarz/i).first().click();

    // Zatwierdzona seria 1 -> staje się wierszem SetRow (statycznym, gestowym),
    // dokładnie tym, co testujemy.
    await page.getByLabel(/Ciężar w kilogramach, seria 1/i).fill("50");
    await page.getByLabel(/Powtórzenia, seria 1/i).fill("12");
    await page.getByRole("button", { name: /zatwierdź/i }).first().click();
    await expect(page.getByRole("button", { name: "Edytuj serię 1" })).toBeVisible();
  });

  test("swipe w lewo powyżej progu 96 px usuwa serię (toast + Cofnij)", async ({ page }) => {
    const row = page.getByRole("button", { name: "Edytuj serię 1" });
    const box = await row.boundingBox();
    if (box === null) {
      throw new Error("Nie znaleziono geometrii wiersza serii");
    }
    const startX = box.x + box.width - 20;
    const y = box.y + box.height / 2;

    await page.mouse.move(startX, y);
    await page.mouse.down();
    // Kilka pośrednich kroków w poziomie -- realistyczny gest, nie teleportacja
    // (komponent liczy dx względem poprzedniej pozycji przy każdym pointermove).
    for (const dx of [10, 30, 60, 90, 115]) {
      await page.mouse.move(startX - dx, y, { steps: 3 });
    }
    await page.mouse.up();

    await expect(page.getByText("Seria usunięta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cofnij" })).toBeVisible();
    // Wiersz zniknął jako SetRow (nie ma już "Edytuj serię 1" -- przenumerowanie
    // mogło zostawić inny numer, ale accessible name "1" specyficznie nie istnieje
    // dla tej serii, bo została usunięta).
  });

  test("swipe poniżej progu 96 px NIE usuwa serii (wraca na miejsce)", async ({ page }) => {
    const row = page.getByRole("button", { name: "Edytuj serię 1" });
    const box = await row.boundingBox();
    if (box === null) {
      throw new Error("Nie znaleziono geometrii wiersza serii");
    }
    const startX = box.x + box.width - 20;
    const y = box.y + box.height / 2;

    await page.mouse.move(startX, y);
    await page.mouse.down();
    // Tylko 40 px -- poniżej SWIPE_THRESHOLD_PX (96), wiersz musi wrócić.
    await page.mouse.move(startX - 40, y, { steps: 3 });
    await page.mouse.up();

    await expect(page.getByText("Seria usunięta")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edytuj serię 1" })).toBeVisible();
  });

  test("long-press 500 ms usuwa serię bez ruchu (toast + Cofnij)", async ({ page }) => {
    const row = page.getByRole("button", { name: "Edytuj serię 1" });
    const box = await row.boundingBox();
    if (box === null) {
      throw new Error("Nie znaleziono geometrii wiersza serii");
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    // LONG_PRESS_MS = 500 -- czekamy wyraźnie dłużej, żeby nie ścigać się z timerem.
    await page.waitForTimeout(700);
    await page.mouse.up();

    await expect(page.getByText("Seria usunięta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cofnij" })).toBeVisible();
  });

  test("krótkie przytrzymanie (300 ms, poniżej progu) NIE usuwa serii i liczy się jako zwykły tap", async ({
    page,
  }) => {
    const row = page.getByRole("button", { name: "Edytuj serię 1" });
    const box = await row.boundingBox();
    if (box === null) {
      throw new Error("Nie znaleziono geometrii wiersza serii");
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(300); // poniżej LONG_PRESS_MS (500)
    await page.mouse.up();

    await expect(page.getByText("Seria usunięta")).toHaveCount(0);
    // Zwykły tap = edycja wiersza (onEdit), więc wiersz 1 powinien stać się aktywny.
    await expect(page.getByLabel(/Ciężar w kilogramach, seria 1/i)).toBeVisible();
  });
});
