import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import { USER_A } from "./support/api";

/**
 * Nie testuje etapu 4 -- sprawdza, że sam aparat (Playwright, logowanie,
 * routing, konto Minio) działa niezależnie od tego, czy ekran treningu jest
 * gotowy. To powinno być ZIELONE od razu (etap 2 istnieje); jeśli to
 * czerwone, problem jest w infrastrukturze testów, nie w etapie 4.
 */
test.describe("Aparat testowy (baseline, niezależny od etapu 4)", () => {
  test("logowanie kontem Minio i wejście na /trening", async ({ page, userAToken }) => {
    void userAToken;

    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");

    await expect(page).toHaveURL(/\/trening$/);
    // exact: true -- bez tego locator łapie też <h2>Aktywny trening</h2> ze
    // stubu ekranu (Playwright dopasowuje nazwę jako podciąg domyślnie).
    await expect(page.getByRole("heading", { name: "Trening", exact: true })).toBeVisible();
  });

  test("logowanie z błędnym hasłem pokazuje komunikat, nie wywala apki", async ({ page }) => {
    await page.goto("/logowanie");
    await page.getByLabel("Login").fill(USER_A.login);
    await page.getByLabel("Hasło").fill("zle-haslo-na-pewno");
    await page.getByRole("button", { name: /Zaloguj/ }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/logowanie/);
  });
});
