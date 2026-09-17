import { loginViaUi } from "./support/auth";
import { API_URL, USER_A } from "./support/api";
import { expect, test } from "./support/fixtures";

/**
 * Etap 8: pulpit.
 *
 * Test nie zna liczb tego konta i nie ma prawa ich znać — historia `Minio`
 * rośnie z każdego przebiegu e2e. Sprawdzamy więc to, co jest niezmienne:
 * **na ekranie stoją dokładnie te liczby, które policzył backend**, pigułki
 * zakresu i tabela działają, a przełącznik deloadu pyta serwer na nowo
 * (trend liczy serwer, nie przeglądarka).
 */

interface DashboardTotals {
  workoutCount: number;
  workingSetCount: number;
  volumeKg: number;
}

test.describe("Etap 8: pulpit", () => {
  test("kafle pokazują liczby policzone przez backend", async ({ apiRequest, userAToken, page }) => {
    const response = await apiRequest.get(`${API_URL}/api/dashboard?weeks=27`, {
      headers: { Authorization: `Bearer ${userAToken.accessToken}` },
    });
    expect(response.ok()).toBe(true);
    const totals = ((await response.json()) as { totals: DashboardTotals }).totals;

    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/pulpit");

    if (totals.workoutCount === 0) {
      // Konto bez historii (świeża baza) — pulpit ma prowadzić do treningu,
      // a nie pokazywać pustych wykresów.
      await expect(page.getByRole("link", { name: "Rozpocznij trening" })).toBeVisible();
      return;
    }

    await expect(page.getByText("Treningi", { exact: true })).toBeVisible();
    const tiles = page.locator("p.label-caps", { hasText: /^(Treningi|Serie|Objętość)$/ });
    await expect(tiles).toHaveCount(3);

    // Liczba treningów i serii: żadnego formatowania, więc porównanie wprost.
    await expect(
      page.locator("div", { has: page.getByText("Treningi", { exact: true }) }).last(),
    ).toContainText(String(totals.workoutCount));
    await expect(
      page.locator("div", { has: page.getByText("Serie", { exact: true }) }).last(),
    ).toContainText(String(totals.workingSetCount));
  });

  test("zakres i tabela działają bez sieci w tle", async ({ page }) => {
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/pulpit");

    const tile = page.getByRole("region", { name: "Objętość tygodniowa" });
    await expect(tile).toBeVisible();

    // Pulpit pobiera zakres RAZ; pigułki filtrują to, co już jest w pamięci.
    let requestsAfterLoad = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/dashboard")) {
        requestsAfterLoad += 1;
      }
    });

    await tile.getByRole("button", { name: "1M" }).click();
    await expect(tile.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "true");
    await tile.getByRole("button", { name: "6M" }).click();
    await page.waitForTimeout(500);
    expect(requestsAfterLoad, "zmiana zakresu nie ma pytać serwera").toBe(0);

    const tableToggle = tile.getByRole("button", { name: "Tabela" });
    if (await tableToggle.isVisible()) {
      await tableToggle.click();
      await expect(tile.getByRole("columnheader", { name: "Tydzień" })).toBeVisible();
      await expect(tile.getByRole("columnheader", { name: "Objętość" })).toBeVisible();
      await expect(tile.getByRole("button", { name: "Wykres" })).toBeVisible();
    }
  });

  test("przełącznik deloadu pyta serwer o nowy trend", async ({ page }) => {
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/pulpit");

    const toggle = page.getByRole("button", { name: "Licz tygodnie deload" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    const request = page.waitForRequest((candidate) =>
      candidate.url().includes("includeDeload=true"),
    );
    await toggle.click();
    await request;
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});
