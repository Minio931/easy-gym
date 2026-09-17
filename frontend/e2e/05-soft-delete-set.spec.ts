import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import { USER_A } from "./support/api";
import { startEmptyWorkoutViaUi } from "./support/workout-ui";

/**
 * §3 spec: usunięcie serii to soft delete (`DELETE` endpointu, nie zniknięcie
 * z pamięci) -- po odświeżeniu NIE wraca. Toast `Seria usunięta` + `Cofnij`
 * żyje 8 s (§7 "Twarde minimum" pkt 9).
 */
test.describe("Miękkie usunięcie serii", () => {
  test.beforeEach(async ({ page, userAToken }) => {
    void userAToken;
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");
    await startEmptyWorkoutViaUi(page);
    await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();

    const searchBox = page.getByRole("textbox").first();
    await searchBox.fill("martwy ciąg");
    await page.waitForResponse((res) => res.url().includes("/api/exercises?query="));
    await page.getByText(/martwy ciąg|martwy/i).first().click();

    await page.getByLabel(/Ciężar w kilogramach, seria 1/i).fill("120");
    await page.getByLabel(/Powtórzenia, seria 1/i).fill("5");
    await page.getByRole("button", { name: /zatwierdź/i }).first().click();
  });

  test("usunięcie przez pigułkę 'Usuń serię' woła DELETE i seria nie wraca po odświeżeniu", async ({
    page,
  }) => {
    // Wiersz zatwierdzony -> tap aktywuje edycję (§3), gdzie żyje pigułka "Usuń serię".
    await page.getByText(/120.*5|1\s*│.*120/).first().click();

    const deleteResponse = page.waitForResponse(
      (res) => /\/sets\/[^/]+$/.test(res.url()) && res.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: "Usuń serię" }).click();
    const response = await deleteResponse;
    expect(response.status(), "Usunięcie serii musi iść przez DELETE endpointu (soft delete), nie tylko lokalnie").toBeLessThan(
      300,
    );

    await expect(page.getByText("Seria usunięta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cofnij" })).toBeVisible();

    await page.reload();

    await expect(page.getByLabel(/Ciężar w kilogramach, seria 1/i)).toHaveCount(0);
    await expect(page.getByText(/120/)).toHaveCount(0);
  });

  test("'Cofnij' w toaście przywraca usuniętą serię", async ({ page }) => {
    await page.getByText(/120.*5|1\s*│.*120/).first().click();
    await page.getByRole("button", { name: "Usuń serię" }).click();

    await page.getByRole("button", { name: "Cofnij" }).click();

    // Po cofnięciu seria może wrócić jako wiersz AKTYWNY (edytowalny input z
    // value="120"), nie jako statyczny tekst -- getByText nie widzi wartości
    // inputów, więc sprawdzamy oba warianty: albo tekst "120" gdzieś na
    // stronie, albo input ciężaru z wartością "120".
    const textVariant = page.getByText(/120/).first();
    const weightInput = page.getByLabel(/Ciężar w kilogramach/i).first();
    const hasText = await textVariant
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasText) {
      await expect(weightInput).toHaveValue("120");
    }
  });
});
