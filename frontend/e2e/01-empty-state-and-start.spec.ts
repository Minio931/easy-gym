import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import { USER_A } from "./support/api";
import { startEmptyWorkoutViaUi } from "./support/workout-ui";

/**
 * §4 spec: stan pusty (204 na /active) + start pustego treningu.
 * Mikrokopia z etap4-ux-spec.md §4 i §6.
 */
test.describe("Stan pusty i start treningu", () => {
  test.beforeEach(async ({ page, userAToken }) => {
    void userAToken; // fixture gwarantuje 204 na /api/workouts/active
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");
  });

  test("brak aktywnego treningu pokazuje stan pusty z przyciskiem startu", async ({ page }) => {
    await expect(page.getByText(/Nie masz otwartego treningu/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Rozpocznij trening" })).toBeVisible();
  });

  test("Rozpocznij trening renderuje się natychmiast (UUID po stronie klienta, bez czekania na serwer)", async ({
    page,
  }) => {
    // Celowo BEZ czekania na sieć tutaj -- to jest właśnie to, co testujemy
    // (§2: ekran renderuje się NATYCHMIAST z lokalnego obiektu, odpowiedź
    // serwera tylko go uzgadnia). Czekanie na POST poniżej (po asercjach) jest
    // tylko higieną sprzątania fixture'a, nie częścią sprawdzanego zachowania.
    const created = page.waitForResponse(
      (res) => res.url().endsWith("/api/workouts") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Rozpocznij trening" }).click();

    await expect(page.getByRole("button", { name: "+ Dodaj ćwiczenie" })).toBeVisible({ timeout: 2_000 });
    await expect(page.getByRole("button", { name: "Zakończ trening" })).toBeVisible();
    await expect(page.getByText(/Nie masz otwartego treningu/)).not.toBeVisible();

    await created; // pozwól żądaniu dolecieć, żeby sprzątanie po teście nie wyścigowało się z nim
  });

  test("po starcie treningu stan pusty znika i zostaje karta 'pusty trening'", async ({ page }) => {
    await startEmptyWorkoutViaUi(page);
    // §6 spec: "Pusty trening. Dodaj pierwsze ćwiczenie."
    await expect(page.getByText("Pusty trening. Dodaj pierwsze ćwiczenie.")).toBeVisible();
  });
});
