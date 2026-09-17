import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import {
  USER_A,
  addExerciseToWorkout,
  addSetToWorkout,
  findExerciseId,
  finishWorkoutViaApi,
  startWorkoutViaApi,
} from "./support/api";
import { startEmptyWorkoutViaUi } from "./support/workout-ui";

/**
 * Zadanie od prowadzącego (faza 2, pkt 4) -- niezależne potwierdzenie pięciu
 * rzeczy, które implementujący naprawiał po drodze. Każdy blok testuje
 * DOKŁADNIE jedną z nich, żeby regresja była jednoznacznie zlokalizowana.
 */

/**
 * Sprawdza, że arkusz (`role="dialog"`) łapie focus: `#app-root` ma `inert`,
 * a Tab NIGDY nie ląduje na elemencie pod nim (`components/ui/sheet.tsx`).
 *
 * Mechanizm to natywny `inert`, nie ręcznie zarządzana pętla fokusu -- więc
 * po ostatnim polu arkusza Tab przejściowo trafia w `<body>`, zanim wróci do
 * pierwszego pola arkusza (bo poza dialogiem nic więcej nie jest fokusowalne).
 * To jest nieszkodliwe i zgodne z oczekiwaniem; NIE sprawdzamy więc, że każdy
 * Tab ląduje w dialogu, tylko że żaden Tab nie ląduje pod `#app-root` --
 * dokładnie to, przed czym ostrzega komentarz w `sheet.tsx` („Zakończ" w
 * arkuszu i „Zakończ trening" pod spodem jednocześnie osiągalne).
 */
async function assertSheetTrapsFocus(page: Page): Promise<void> {
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#app-root")).toHaveAttribute("inert", "");

  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const reachedBackground = await page.evaluate(() => {
      const active = document.activeElement;
      return active !== null && active.closest("#app-root") !== null;
    });
    expect(
      reachedBackground,
      `Tab #${i + 1} dosięgnął elementu pod #app-root mimo inert -- treść pod modalem jest osiągalna klawiaturą`,
    ).toBe(false);
  }
}

test.describe("Faza 2 pkt 4 -- kontrole niezależne od implementującego", () => {
  test.describe("(a) Podsumowanie a podwójny montaż efektu w React strict mode", () => {
    test("świeże wejście na /trening/{id}/podsumowanie ładuje dane, nie pokazuje błędu", async ({
      page,
      apiRequest,
      userAToken,
    }) => {
      const workout = await startWorkoutViaApi(apiRequest, userAToken.accessToken);
      const exercise = await findExerciseId(apiRequest, userAToken.accessToken, "wyciskanie");
      const we = await addExerciseToWorkout(apiRequest, userAToken.accessToken, workout.id, exercise.id);
      await addSetToWorkout(apiRequest, userAToken.accessToken, workout.id, we.id, {
        weightKg: 100,
        reps: 5,
      });
      await finishWorkoutViaApi(apiRequest, userAToken.accessToken, workout.id);

      await loginViaUi(page, USER_A.login, USER_A.password);
      // page.goto (nie SPA-nawigacja) = pełny, świeży mount komponentu --
      // dokładnie ten scenariusz, w którym React strict mode montuje efekt
      // dwa razy i pierwszy fetch dostaje AbortError.
      await page.goto(`/trening/${workout.id}/podsumowanie`);

      await expect(page.getByText("Nie udało się wczytać podsumowania.")).toHaveCount(0);
      await expect(page.getByText("Czas", { exact: true })).toBeVisible();
      await expect(page.getByText("Objętość kg", { exact: true })).toBeVisible();
      // 100 kg x 5 powt. = 500 kg objętości (displayVolumeKg) -- realna
      // wartość z serwera, nie tylko obecność kafli.
      await expect(page.getByText("500", { exact: true })).toBeVisible();
    });
  });

  test.describe("(b) Arkusze pułapkują focus (Tab nie wychodzi pod modal)", () => {
    test.beforeEach(async ({ page, userAToken }) => {
      void userAToken;
      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto("/trening");
      await startEmptyWorkoutViaUi(page);
    });

    test("arkusz wyboru ćwiczenia", async ({ page }) => {
      await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
      await assertSheetTrapsFocus(page);
      await page.keyboard.press("Escape");
      await expect(page.locator("#app-root")).not.toHaveAttribute("inert", "");
    });

    test("arkusz zakończenia treningu", async ({ page }) => {
      await page.getByRole("button", { name: "Zakończ trening" }).click();
      await assertSheetTrapsFocus(page);
      await page.keyboard.press("Escape");
      await expect(page.locator("#app-root")).not.toHaveAttribute("inert", "");
    });

    test("menu sesji (Opcje treningu)", async ({ page }) => {
      await page.getByRole("button", { name: "Opcje treningu" }).click();
      await assertSheetTrapsFocus(page);
      await page.keyboard.press("Escape");
      await expect(page.locator("#app-root")).not.toHaveAttribute("inert", "");
    });

    test("menu ćwiczenia (Opcje ćwiczenia)", async ({ page }) => {
      await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
      const searchBox = page.getByRole("textbox").first();
      await searchBox.fill("przysiad");
      await page.waitForResponse((res) => res.url().includes("/api/exercises?query="));
      await page.getByText(/przysiad/i).first().click();

      await page.getByRole("button", { name: /Opcje ćwiczenia/ }).click();
      await assertSheetTrapsFocus(page);
      await page.keyboard.press("Escape");
      await expect(page.locator("#app-root")).not.toHaveAttribute("inert", "");
    });
  });

  test.describe("(c) Brak poziomego scrolla przy 320 px", () => {
    test("ekran pusty, aktywny trening z ćwiczeniem i arkusz wyszukiwarki", async ({
      page,
      userAToken,
    }) => {
      void userAToken;
      await page.setViewportSize({ width: 320, height: 844 });
      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto("/trening");

      const noHorizontalScroll = () =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

      expect(await noHorizontalScroll(), "stan pusty scrolluje w poziomie przy 320 px").toBe(true);

      await startEmptyWorkoutViaUi(page);
      expect(await noHorizontalScroll(), "pusty trening scrolluje w poziomie przy 320 px").toBe(true);

      await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
      const searchBox = page.getByRole("textbox").first();
      await searchBox.fill("wyciskanie");
      await page.waitForResponse((res) => res.url().includes("/api/exercises?query="));
      expect(await noHorizontalScroll(), "arkusz wyszukiwarki scrolluje w poziomie przy 320 px").toBe(
        true,
      );
      await page.getByText(/wyciskanie/i).first().click();

      // Wiersz aktywny (steppery + chipy RPE/znaczników) jest najgęstszym
      // layoutem na ekranie -- to on najbardziej ryzykuje przelanie się.
      expect(
        await noHorizontalScroll(),
        "aktywny wiersz serii (steppery + chipy) scrolluje w poziomie przy 320 px",
      ).toBe(true);
    });
  });

  test.describe("(d) Timer przerwy przeżywa nawigację /pulpit -> /trening", () => {
    test("timer widoczny na /pulpit i dalej liczy po powrocie na /trening", async ({
      page,
      userAToken,
    }) => {
      void userAToken;
      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto("/trening");
      await startEmptyWorkoutViaUi(page);
      await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
      const searchBox = page.getByRole("textbox").first();
      await searchBox.fill("wyciskanie");
      await page.waitForResponse((res) => res.url().includes("/api/exercises?query="));
      await page.getByText(/wyciskanie/i).first().click();

      await page.getByLabel(/Ciężar w kilogramach, seria 1/i).fill("60");
      await page.getByLabel(/Powtórzenia, seria 1/i).fill("10");
      await page.getByRole("button", { name: /zatwierdź/i }).first().click();

      // Timer wystartował -- widoczny na /trening.
      await expect(page.getByText("przerwa")).toBeVisible();

      await page.getByRole("link", { name: "Pulpit" }).click();
      await expect(page).toHaveURL(/\/pulpit/);
      // §5 spec: "widoczny również poza /trening" -- to NIE jest tylko
      // "przeżywa w tle", pasek ma być na ekranie.
      await expect(page.getByText("przerwa")).toBeVisible();

      // exact: true -- na /pulpit "Trening" jest podciągiem też w "Rozpocznij
      // trening" (skrót dashboardu) i w pasku "Trening trwa 0:xx".
      await page.getByRole("link", { name: "Trening", exact: true }).click();
      await expect(page).toHaveURL(/\/trening$/);
      await expect(page.getByText("przerwa")).toBeVisible();
    });
  });

  test.describe("(e) Cofnięcie po zamknięciu podsumowania nie wraca do martwej sesji", () => {
    test("back z /pulpit po zamknięciu podsumowania nie pokazuje skończonego treningu jako żywego", async ({
      page,
      apiRequest,
      userAToken,
    }) => {
      const workout = await startWorkoutViaApi(apiRequest, userAToken.accessToken);
      const exercise = await findExerciseId(apiRequest, userAToken.accessToken, "wiosłowanie");
      const we = await addExerciseToWorkout(apiRequest, userAToken.accessToken, workout.id, exercise.id);
      await addSetToWorkout(apiRequest, userAToken.accessToken, workout.id, we.id, {
        weightKg: 40,
        reps: 10,
      });
      await finishWorkoutViaApi(apiRequest, userAToken.accessToken, workout.id);

      await loginViaUi(page, USER_A.login, USER_A.password);
      // Historia: /pulpit (po loginie) -> /trening/{id}/podsumowanie (goto, wpis w historii).
      await page.goto(`/trening/${workout.id}/podsumowanie`);
      await expect(page.getByText("Czas", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Zamknij podsumowanie" }).click();
      await expect(page).toHaveURL(/\/pulpit$/);

      await page.goBack();

      // Nie może wrócić na podsumowanie martwej sesji...
      await expect(page).not.toHaveURL(/\/trening\/.+\/podsumowanie$/);
      // ...a jeśli cofnięcie wyląduje na /trening, trening skończony NIE może
      // pokazać się jako wciąż żywy (to byłby gorszy bug niż samo podsumowanie).
      const url = page.url();
      if (/\/trening$/.test(url)) {
        await expect(page.getByRole("button", { name: "Zakończ trening" })).toHaveCount(0);
      }
    });
  });
});
