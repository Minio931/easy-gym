import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import { USER_A, USER_B, getActiveWorkout, startWorkoutViaApi } from "./support/api";

/**
 * Izolacja per-user (`backend/CLAUDE.md`: "test izolacja user A / user B"
 * jest obowiązkowy przy każdym endponcie per-user; `backend/API.md`: cudzy
 * rekord to 404, nie 403). Tu sprawdzamy to na warstwie API (powinno być
 * zielone już teraz, bo backend etap 4-8 jest gotowy) ORAZ na ekranie
 * treningu (etap 4 frontu -- to jest część, która może być jeszcze czerwona).
 */
test.describe("Izolacja: Wojtur nie widzi treningu Minio", () => {
  test("API: cudzy trening to 404, nie 403, i nie wycieka przez /active", async ({ apiRequest, userAToken, userBToken }) => {
    const workout = await startWorkoutViaApi(apiRequest, userAToken.accessToken);

    // Wojtur nie ma własnego aktywnego treningu -> 204, nie trening Minio.
    const wojturActive = await getActiveWorkout(apiRequest, userBToken.accessToken);
    expect(wojturActive).toBeNull();

    // Bezpośrednie żądanie po ID treningu Minio kontem Wojtura -> 404.
    const apiUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8081";
    const res = await apiRequest.get(`${apiUrl}/api/workouts/${workout.id}`, {
      headers: { Authorization: `Bearer ${userBToken.accessToken}` },
    });
    expect(res.status()).toBe(404);
  });

  test("UI: Wojtur wchodząc na /trening widzi stan pusty, nie sesję Minio", async ({
    page,
    apiRequest,
    userAToken,
    userBToken,
  }) => {
    void userBToken; // fixture gwarantuje czysty stan Wojtura
    await startWorkoutViaApi(apiRequest, userAToken.accessToken);

    await loginViaUi(page, USER_B.login, USER_B.password);
    await page.goto("/trening");

    await expect(page.getByText(/Nie masz otwartego treningu/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Zakończ trening" })).toHaveCount(0);
  });

  test("sanity: Minio faktycznie widzi swój trening (kontrast dla testu izolacji powyżej)", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    await startWorkoutViaApi(apiRequest, userAToken.accessToken);

    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");

    await expect(page.getByRole("button", { name: "+ Dodaj ćwiczenie" })).toBeVisible();
  });
});
