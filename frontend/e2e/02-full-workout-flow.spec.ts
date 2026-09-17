import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import { USER_A } from "./support/api";
import { startEmptyWorkoutViaUi } from "./support/workout-ui";

/**
 * Pełna ścieżka szczęśliwa etapu 4 (zadanie QA, scenariusz 2):
 * rozpoczęcie pustego treningu -> dodanie ćwiczenia przez wyszukiwarkę ->
 * 2-3 serie (w tym rozgrzewkowa) -> zakończenie -> podsumowanie.
 *
 * Założenia co do selektorów, których spec (etap4-ux-spec.md) nie precyzuje
 * literalnie -- jeśli implementacja użyje innych aria-label, ten test trzeba
 * będzie dostroić, nie jest to błąd frontu per se:
 * - przycisk zatwierdzenia serii ma w dostępnej nazwie słowo "zatwierdź"
 *   (spec mówi tylko "✓ Zatwierdź", bez podania dokładnego aria-label).
 * - wiersz wyniku wyszukiwania jest klikalny i zawiera nazwę ćwiczenia w
 *   tekście (spec §2.5: "Tap = POST .../exercises").
 */
test.describe("Pełny przebieg treningu: start -> ćwiczenie -> serie -> koniec -> podsumowanie", () => {
  test.beforeEach(async ({ page, userAToken }) => {
    void userAToken;
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");
    await startEmptyWorkoutViaUi(page);
    await expect(page.getByRole("button", { name: "+ Dodaj ćwiczenie" })).toBeVisible();
  });

  test("dodanie ćwiczenia, 3 serie (1 rozgrzewkowa + 2 robocze), zakończenie i podsumowanie", async ({
    page,
  }) => {
    // --- Dodanie ćwiczenia przez wyszukiwarkę (§2) ---
    await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
    await expect(page.getByRole("button", { name: "Anuluj" })).toBeVisible();

    const searchBox = page.getByRole("textbox").first();
    await expect(searchBox).toBeFocused(); // autoFocus wymagany przez spec
    await searchBox.fill("wyciskanie");

    // debounce 250 ms + fuzzy search po stronie bazy -- czekamy na realną odpowiedź API.
    const searchResponse = page.waitForResponse(
      (res) => res.url().includes("/api/exercises?query=") && res.request().method() === "GET",
    );
    await searchResponse;

    const firstResult = page.getByText(/wyciskanie/i).first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();

    // Sheet się zamyka, ekran scrolluje do nowej karty, arkusz znika bez potwierdzania.
    await expect(page.getByRole("button", { name: "Anuluj" })).not.toBeVisible();

    // --- Seria 1: rozgrzewkowa (§3) ---
    await page.getByLabel(/Ciężar w kilogramach, seria 1/i).fill("40");
    await page.getByLabel(/Powtórzenia, seria 1/i).fill("10");
    await page.getByRole("button", { name: "Rozgrzewka" }).click();
    await page.getByRole("button", { name: /zatwierdź/i }).first().click();

    // --- Seria 2: robocza, 60 kg x 8 ---
    // Zatwierdzenie serii 1 otwiera od razu kolejny pusty wiersz (§3: "otwiera
    // się kolejny pusty wiersz serii"), więc pole serii 2 powinno już istnieć.
    await page.getByLabel(/Ciężar w kilogramach, seria 2/i).fill("60");
    await page.getByLabel(/Powtórzenia, seria 2/i).fill("8");
    await page.getByRole("button", { name: /zatwierdź/i }).first().click();

    // --- Seria 3: "Kopiuj poprzednią serię" -- jeden tap = seria + zatwierdzenie (§3) ---
    await page.getByRole("button", { name: "Kopiuj poprzednią serię" }).click();

    // Rozgrzewka wyklucza się z objętości natychmiast, w nagłówku karty (§3) --
    // 2 serie robocze x 60 kg x 8 = 960 kg.
    await expect(page.getByText(/960/).first()).toBeVisible();

    // --- Zakończenie treningu (§2) ---
    await page.getByRole("button", { name: "Zakończ trening" }).click();
    await expect(page.getByRole("button", { name: "Zakończ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Wróć do treningu" })).toBeVisible();

    const finishResponse = page.waitForResponse(
      (res) => res.url().includes("/finish") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Zakończ" }).click();
    await finishResponse;

    // Nawigacja `replace` do /trening/{id}/podsumowanie (§2) -- cofnięcie nie
    // może wrócić do żywej sesji, więc sprawdzamy też, że wstecz nie wraca.
    await expect(page).toHaveURL(/\/trening\/.+\/podsumowanie$/);

    // --- Podsumowanie (§2, kafle z §6) ---
    await expect(page.getByText("Czas", { exact: true })).toBeVisible();
    await expect(page.getByText("Objętość kg", { exact: true })).toBeVisible();
    await expect(page.getByText("Serie", { exact: true })).toBeVisible();
    await expect(page.getByText(/960/).first()).toBeVisible();

    // Sekcja PR jest WARUNKOWA -- pokazuje się tylko gdy personalRecordsBrokenIn
    // nie jest puste (§2: "Gdy puste -- sekcji rekordów nie ma wcale").
    const prSection = page.getByText("Rekordy pobite w tej sesji");
    if (await prSection.count()) {
      await expect(prSection).toBeVisible();
      await expect(
        page.getByText("Rozgrzewka i serie z asystą nie wchodzą do rekordów. Remis nie liczy się jako pobicie."),
      ).toBeVisible();
    }

    await page.getByRole("button", { name: "Zamknij podsumowanie" }).click();
    await expect(page).toHaveURL(/\/pulpit$/);

    // Cofnięcie z podsumowania (replace) nie może wskrzesić martwej sesji.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/trening\/.+\/podsumowanie$/);
  });
});
