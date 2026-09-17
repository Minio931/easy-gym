import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import { USER_A } from "./support/api";
import { startEmptyWorkoutViaUi } from "./support/workout-ui";

/**
 * §4 tabela "Brak sieci": pigułka `● Offline`, ekran działa identycznie,
 * żadnego modala/czerwieni/blokowania przycisków, zmiany czekają w kolejce.
 * `lib/auth/...` (etap 2, już zaimplementowany) gwarantuje, że offline NIGDY
 * nie wylogowuje (`OfflineError` osobna klasa od `ApiError`) -- to sprawdzamy
 * też tutaj, na realnym ekranie treningu.
 *
 * `context.setOffline(true)` odcina sieć na poziomie przeglądarki (CDP) --
 * to jest "odetnij żądania w Playwright" z zadania, silniejsze niż
 * przechwytywanie pojedynczych route'ów.
 */
test.describe("Brak sieci w trakcie treningu", () => {
  test("pigułka Offline pojawia się i zostaje po powrocie na dowolnym ekranie", async ({ page, userAToken }) => {
    void userAToken;
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");

    await expect(page.getByRole("status").filter({ hasText: "Offline" })).toHaveCount(0);

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();

    // Wraca sieć -> pigułka znika, zgodnie z regułą "cisza jest normą".
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByRole("status").filter({ hasText: "Offline" })).toHaveCount(0);
  });

  test("offline w trakcie treningu: brak wylogowania, brak utraty wpisanych danych", async ({
    page,
    userAToken,
  }) => {
    void userAToken;
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");
    await startEmptyWorkoutViaUi(page); // przed setOffline -- musi zdążyć dolecieć, zanim odetniemy sieć
    await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();

    const searchBox = page.getByRole("textbox").first();
    await searchBox.fill("wiosłowanie");
    await page.waitForResponse((res) => res.url().includes("/api/exercises?query="));
    await page.getByText(/wiosłowanie|wioślarz/i).first().click();

    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // Dane wpisane offline nie mogą zniknąć -- UI pokazuje stan docelowy od
    // razu, zapis (kolejka) dogania w tle (§4 "Zapis w tle").
    await page.getByLabel(/Ciężar w kilogramach, seria 1/i).fill("77.5");
    await page.getByLabel(/Powtórzenia, seria 1/i).fill("6");
    await page.getByRole("button", { name: /zatwierdź/i }).first().click();

    await expect(page.getByText(/77[.,]5/)).toBeVisible();

    // Żadnej czerwieni/modala/wylogowania -- ekran działa identycznie (§4).
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/trening/);
    await expect(page).not.toHaveURL(/\/logowanie/);

    // Dane wciąż wpisane (nic nie zniknęło pod ręką) mimo braku sieci.
    await expect(page.getByLabel(/Ciężar w kilogramach/i).first()).not.toHaveValue("");

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // Sieć wraca -> nawigacja po apce (klient, Next router) nadal nie
    // wylogowuje (kluczowa reguła z etapu 2: OfflineError nigdy nie czyści
    // sesji, więc kolejka offline musi dojechać, a nie zostawić 401).
    await page.getByRole("link", { name: "Pulpit" }).click();
    await expect(page).not.toHaveURL(/\/logowanie/);
  });
});
