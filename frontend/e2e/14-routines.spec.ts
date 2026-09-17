import { loginViaUi } from "./support/auth";
import {
  USER_A,
  addExerciseToWorkout,
  addSetToWorkout,
  clearRoutinesNamed,
  createExerciseViaApi,
  deleteExerciseViaApi,
  finishWorkoutViaApi,
  listRoutinesViaApi,
  startWorkoutViaApi,
} from "./support/api";
import { expect, test } from "./support/fixtures";

/**
 * Szablony treningów: układanie planu raz zamiast dobierania ćwiczeń za
 * każdym razem.
 *
 * Każdy test tworzy WŁASNE ćwiczenia o unikalnych nazwach i sprząta po sobie
 * szablony — konto `Minio` zbiera historię z każdego przebiegu, a szablon
 * zostawiony na koncie zaśmieca ekran startu treningu na zawsze.
 */
const PREFIX = "E2E szablon";

test.describe("Szablony treningów", () => {
  test.afterEach(async ({ apiRequest, userAToken }) => {
    await clearRoutinesNamed(apiRequest, userAToken.accessToken, PREFIX);
  });

  test("nowy szablon powstaje w edytorze i ląduje na serwerze z kolejnością i celami", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    const token = userAToken.accessToken;
    const stamp = String(Date.now());
    const first = await createExerciseViaApi(apiRequest, token, `E2E Pierwsze ${stamp}`);
    const second = await createExerciseViaApi(apiRequest, token, `E2E Drugie ${stamp}`);
    const name = `${PREFIX} ${stamp}`;

    try {
      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto("/szablony/nowy");

      await page.getByLabel("Nazwa").fill(name);
      for (const exercise of [first, second]) {
        await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
        await page.getByPlaceholder(/szukaj/i).first().fill(exercise.name);
        await page.getByRole("button", { name: new RegExp(exercise.name) }).first().click();
      }

      await page.getByLabel(`Serie — ${first.name}`).fill("4");
      await page.getByLabel(`Powt. — ${first.name}`).fill("8");
      await page.getByRole("button", { name: "Zapisz szablon" }).click();
      await page.waitForURL(/\/szablony$/);

      await expect
        .poll(
          async () => {
            const routine = (await listRoutinesViaApi(apiRequest, token)).find(
              (candidate) => candidate.name === name,
            );
            return routine?.items.map((item) => [item.orderIndex, item.targetSets, item.targetReps]);
          },
          { timeout: 15_000, message: "szablon nie dojechał na serwer" },
        )
        .toEqual([
          [0, 4, 8],
          [1, null, null],
        ]);
    } finally {
      await deleteExerciseViaApi(apiRequest, token, first.id);
      await deleteExerciseViaApi(apiRequest, token, second.id);
    }
  });

  test("edycja PODMIENIA całą listę pozycji, nie dokleja różnicy", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    const token = userAToken.accessToken;
    const stamp = String(Date.now());
    const first = await createExerciseViaApi(apiRequest, token, `E2E Zostaje ${stamp}`);
    const second = await createExerciseViaApi(apiRequest, token, `E2E Znika ${stamp}`);
    const name = `${PREFIX} edycja ${stamp}`;

    try {
      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto("/szablony/nowy");
      await page.getByLabel("Nazwa").fill(name);
      for (const exercise of [first, second]) {
        await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
        await page.getByPlaceholder(/szukaj/i).first().fill(exercise.name);
        await page.getByRole("button", { name: new RegExp(exercise.name) }).first().click();
      }
      await page.getByRole("button", { name: "Zapisz szablon" }).click();
      await page.waitForURL(/\/szablony$/);

      // --- Edycja: usuwamy drugie ćwiczenie ---
      await page.getByRole("link", { name: new RegExp(name) }).click();
      await page.waitForURL(/\/szablony\/[0-9a-f-]{36}$/);
      await expect(page.getByText(second.name)).toBeVisible();
      await page.getByLabel(`Usuń ${second.name} z szablonu`).click();
      await page.getByRole("button", { name: "Zapisz szablon" }).click();
      await page.waitForURL(/\/szablony$/);

      // Pozycja pominięta w żądaniu dostaje tombstone (backend/API.md), więc
      // `GET /api/routines` nie może jej już pokazywać.
      await expect
        .poll(
          async () => {
            const routine = (await listRoutinesViaApi(apiRequest, token)).find(
              (candidate) => candidate.name === name,
            );
            return routine?.items.map((item) => item.exerciseId);
          },
          { timeout: 15_000, message: "usunięta pozycja została na serwerze" },
        )
        .toEqual([first.id]);
    } finally {
      await deleteExerciseViaApi(apiRequest, token, first.id);
      await deleteExerciseViaApi(apiRequest, token, second.id);
    }
  });

  test("szablon odpala trening w swojej kolejności, z licznikiem celu serii", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    const token = userAToken.accessToken;
    const stamp = String(Date.now());
    const exercise = await createExerciseViaApi(apiRequest, token, `E2E Start ${stamp}`);
    const name = `${PREFIX} start ${stamp}`;

    try {
      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto("/szablony/nowy");
      await page.getByLabel("Nazwa").fill(name);
      await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
      await page.getByPlaceholder(/szukaj/i).first().fill(exercise.name);
      await page.getByRole("button", { name: new RegExp(exercise.name) }).first().click();
      await page.getByLabel(`Serie — ${exercise.name}`).fill("3");
      await page.getByRole("button", { name: "Zapisz szablon" }).click();
      await page.waitForURL(/\/szablony$/);

      await page.goto("/trening");
      await page.getByRole("button", { name: new RegExp(name) }).click();

      await expect(page.getByRole("heading", { name: exercise.name })).toBeVisible();
      // `targetSets` z szablonu zasila licznik serii roboczych na karcie.
      await expect(page.getByText("0/3")).toBeVisible();
    } finally {
      await deleteExerciseViaApi(apiRequest, token, exercise.id);
    }
  });

  test("zakończony trening zapisuje się jako szablon z celami z tej sesji", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    const token = userAToken.accessToken;
    const stamp = String(Date.now());
    const exercise = await createExerciseViaApi(apiRequest, token, `E2E Sesja ${stamp}`);
    const name = `${PREFIX} z sesji ${stamp}`;

    try {
      const workout = await startWorkoutViaApi(apiRequest, token);
      const added = await addExerciseToWorkout(apiRequest, token, workout.id, exercise.id);
      for (const [index, reps] of [8, 8, 6].entries()) {
        await addSetToWorkout(apiRequest, token, workout.id, added.id, {
          setIndex: index,
          weightKg: 60,
          reps,
        });
      }
      await finishWorkoutViaApi(apiRequest, token, workout.id);

      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto(`/trening/${workout.id}/podsumowanie?wroc=historia`);

      await page.getByRole("button", { name: "Zapisz jako szablon" }).click();
      await page.getByLabel("Nazwa").fill(name);
      await page.getByRole("button", { name: "Zapisz szablon" }).click();

      // Cel serii = liczba serii roboczych (3), cel powtórzeń = mediana (8).
      await expect
        .poll(
          async () => {
            const routine = (await listRoutinesViaApi(apiRequest, token)).find(
              (candidate) => candidate.name === name,
            );
            return routine?.items.map((item) => [item.targetSets, item.targetReps]);
          },
          { timeout: 15_000, message: "szablon z sesji nie dojechał na serwer" },
        )
        .toEqual([[3, 8]]);
    } finally {
      await deleteExerciseViaApi(apiRequest, token, exercise.id);
    }
  });

  test("usunięcie szablonu pyta o potwierdzenie i znika po stronie serwera", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    const token = userAToken.accessToken;
    const stamp = String(Date.now());
    const exercise = await createExerciseViaApi(apiRequest, token, `E2E Kasowane ${stamp}`);
    const name = `${PREFIX} do kasacji ${stamp}`;

    try {
      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto("/szablony/nowy");
      await page.getByLabel("Nazwa").fill(name);
      await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
      await page.getByPlaceholder(/szukaj/i).first().fill(exercise.name);
      await page.getByRole("button", { name: new RegExp(exercise.name) }).first().click();
      await page.getByRole("button", { name: "Zapisz szablon" }).click();
      await page.waitForURL(/\/szablony$/);

      await page.getByLabel(`Usuń szablon ${name}`).click();
      // Szablon to praca włożona raz i używana miesiącami — „Zostaw" ma
      // naprawdę nic nie robić.
      await page.getByRole("button", { name: "Zostaw" }).click();
      await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();

      await page.getByLabel(`Usuń szablon ${name}`).click();
      await page.getByRole("button", { name: "Usuń" }).click();
      await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);

      await expect
        .poll(
          async () =>
            (await listRoutinesViaApi(apiRequest, token)).some(
              (candidate) => candidate.name === name,
            ),
          { timeout: 15_000, message: "szablon został na serwerze" },
        )
        .toBe(false);
    } finally {
      await deleteExerciseViaApi(apiRequest, token, exercise.id);
    }
  });
});
