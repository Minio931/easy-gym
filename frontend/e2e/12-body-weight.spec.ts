import { loginViaUi } from "./support/auth";
import { bodyWeightsOn, clearBodyWeightsOn, USER_A } from "./support/api";
import { expect, test } from "./support/fixtures";

/**
 * Etap 7: waga ciała.
 *
 * Wszystko dzieje się na DACIE Z PRZESZŁOŚCI, nie na dzisiejszej. Wpis jest
 * upsertem po dniu, więc test na „dziś" nadpisałby prawdziwe ważenie
 * użytkownika, a potem skasował je przy sprzątaniu. Odległy dzień z przeszłości
 * testuje dokładnie te same ścieżki i nie dotyka niczyich danych.
 */
const TEST_DAY = "2021-03-15";

test.describe("Etap 7: waga ciała", () => {
  test.afterEach(async ({ apiRequest, userAToken }) => {
    await clearBodyWeightsOn(apiRequest, userAToken.accessToken, TEST_DAY);
  });

  test("wpis zapisuje się na serwerze, a drugi tego samego dnia go POPRAWIA", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    const token = userAToken.accessToken;
    await clearBodyWeightsOn(apiRequest, token, TEST_DAY);

    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/waga");

    const dayField = page.getByLabel("Dzień");
    const weightField = page.getByLabel("Waga w kilogramach");

    await dayField.fill(TEST_DAY);
    await weightField.fill("81,4");
    await page.getByRole("button", { name: "Zapisz wagę" }).click();

    await expect
      .poll(async () => (await bodyWeightsOn(apiRequest, token, TEST_DAY)).map((e) => e.weightKg), {
        timeout: 15_000,
        message: "wpis wagi nie dojechał na serwer",
      })
      .toEqual([81.4]);

    // --- Drugi wpis tego samego dnia: POPRAWKA, nie nowy rekord ---
    await dayField.fill(TEST_DAY);
    await expect(page.getByText(/Ten dzień ma już wpis/)).toBeVisible();
    // Etykieta przycisku mówi wprost, co się stanie.
    const correctButton = page.getByRole("button", { name: "Popraw wpis" });
    await expect(correctButton).toBeVisible();

    await weightField.fill("80,9");
    await correctButton.click();

    await expect
      .poll(async () => (await bodyWeightsOn(apiRequest, token, TEST_DAY)).map((e) => e.weightKg), {
        timeout: 15_000,
        message: "poprawka utworzyła drugi wpis zamiast nadpisać pierwszy",
      })
      .toEqual([80.9]);
  });

  test("waga poza zakresem nie leci na serwer, tylko wraca komunikatem", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    const token = userAToken.accessToken;
    await clearBodyWeightsOn(apiRequest, token, TEST_DAY);

    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/waga");

    await page.getByLabel("Dzień").fill(TEST_DAY);
    await page.getByLabel("Waga w kilogramach").fill("500");
    await page.getByRole("button", { name: /Zapisz wagę|Popraw wpis/ }).click();

    // Granica jest ta sama co CHECK w bazie — front zaciska ją zawczasu,
    // żeby użytkownik dostał komunikat, a nie 400 z serwera.
    //
    // Szukamy po treści, nie po `role="alert"`: Next wstawia własny, pusty
    // `__next-route-announcer__` z tą samą rolą i lokator trafiałby w dwa elementy.
    await expect(page.getByText(/mniejsza niż 400 kg/)).toBeVisible();
    expect(await bodyWeightsOn(apiRequest, token, TEST_DAY)).toHaveLength(0);
  });
});
