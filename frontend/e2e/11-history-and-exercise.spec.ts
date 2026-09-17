import { loginViaUi } from "./support/auth";
import {
  addExerciseToWorkout,
  addSetToWorkout,
  createExerciseViaApi,
  deleteExerciseViaApi,
  deleteWorkout,
  finishWorkoutViaApi,
  startWorkoutViaApi,
  USER_A,
} from "./support/api";
import { expect, test } from "./support/fixtures";

/**
 * Etap 6: historia treningów i ekran pojedynczego ćwiczenia.
 *
 * Trening przygotowujemy przez API, nie klikaniem — ten test sprawdza EKRANY
 * historii i ćwiczenia, a nie po raz kolejny wpisywanie serii (to jest już
 * pokryte w 02-full-workout-flow). Sprzątamy po sobie, bo zakończony trening
 * nie znika sam i zostałby w historii kolejnych przebiegów.
 */
test.describe("Etap 6: historia i ekran ćwiczenia", () => {
  test("zakończony trening pojawia się w historii i prowadzi do wykresów ćwiczenia", async ({
    page,
    userAToken,
    apiRequest,
  }) => {
    const token = userAToken.accessToken;
    // Własne ćwiczenie o unikalnej nazwie — patrz `createExerciseViaApi`.
    // Na ćwiczeniu z katalogu asercje trafiały w serie z poprzednich przebiegów
    // (cztery komórki „62.5" zamiast jednej), bo zakończone treningi zostają.
    const exercise = await createExerciseViaApi(
      apiRequest,
      token,
      `Historia E2E ${crypto.randomUUID().slice(0, 8)}`,
    );
    const workout = await startWorkoutViaApi(apiRequest, token);

    try {
      const workoutExercise = await addExerciseToWorkout(
        apiRequest,
        token,
        workout.id,
        exercise.id,
      );
      // 2 serie robocze: 60 x 8 i 62.5 x 6 => objętość 480 + 375 = 855 kg.
      await addSetToWorkout(apiRequest, token, workout.id, workoutExercise.id, {
        setIndex: 0,
        weightKg: 60,
        reps: 8,
      });
      await addSetToWorkout(apiRequest, token, workout.id, workoutExercise.id, {
        setIndex: 1,
        weightKg: 62.5,
        reps: 6,
        rpe: 8,
      });
      await finishWorkoutViaApi(apiRequest, token, workout.id);

      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto("/historia");

      // --- Lista historii ---
      const row = page.getByRole("link", { name: /ćwiczenie/ }).first();
      await expect(row).toBeVisible();
      // Objętość liczy baza, nie przeglądarka -- sprawdzamy realną liczbę.
      await expect(page.getByText("855").first()).toBeVisible();

      // --- Wejście w sesję ---
      await row.click();
      await expect(page).toHaveURL(/\/trening\/.+\/podsumowanie/);
      await expect(page.getByText("Podsumowanie").first()).toBeVisible();

      // --- Wejście w ćwiczenie z podsumowania ---
      await page.getByRole("link", { name: exercise.name }).first().click();
      await expect(page).toHaveURL(/\/cwiczenie\//);
      await expect(page.getByRole("heading", { name: exercise.name })).toBeVisible();

      // Rekordy liczy serwer; 62.5 kg to najcięższa seria tego treningu.
      // Uwaga na `text-transform: uppercase` — w DOM jest „Rekordy", nie „REKORDY".
      await expect(page.getByText(/rekordy/i).first()).toBeVisible();

      // Kafel wskazujemy po nazwie dostępnej (`aria-label`), a nie po tekście:
      // słowo „Ciężar" jest i w tytule kafla, i w kafelku rekordu.
      const weightTile = page.getByRole("region", { name: "Ciężar" });

      // --- Tabela: liczba do odczytania bez celowania w punkt (DESIGN §10) ---
      await weightTile.getByRole("button", { name: "Tabela" }).click();
      await expect(weightTile.getByRole("table")).toBeVisible();
      await expect(weightTile.getByRole("cell", { name: "62.5" })).toBeVisible();
      await expect(weightTile.getByRole("cell", { name: "6", exact: true })).toBeVisible();

      // --- Zakres: „Całość" musi pokazywać co najmniej tyle, co „1M" ---
      await weightTile.getByRole("button", { name: "Całość" }).click();
      await expect(weightTile.getByRole("button", { name: "Całość" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(weightTile.getByRole("cell", { name: "62.5" })).toBeVisible();

      // Powrót do wykresu -- przełącznik działa w obie strony.
      await weightTile.getByRole("button", { name: "Wykres" }).click();
      await expect(weightTile.getByRole("table")).toHaveCount(0);
    } finally {
      await deleteWorkout(apiRequest, token, workout.id);
      await deleteExerciseViaApi(apiRequest, token, exercise.id);
    }
  });

  test("przełącznik zakresu naprawdę odcina dane spoza okresu", async ({
    page,
    userAToken,
    apiRequest,
  }) => {
    const token = userAToken.accessToken;
    // Własne ćwiczenie o unikalnej nazwie: jego historia zawiera WYŁĄCZNIE to,
    // co utworzy ten test. Na ćwiczeniu z katalogu asercja „brak danych w tym
    // zakresie" przewracałaby się o treningi z wcześniejszych przebiegów.
    const exercise = await createExerciseViaApi(
      apiRequest,
      token,
      `Zakres E2E ${crypto.randomUUID().slice(0, 8)}`,
    );
    // Trening sprzed pół roku: poza domyślnym zakresem 3M, wewnątrz „Całość".
    const longAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const workout = await startWorkoutViaApi(apiRequest, token, longAgo);

    try {
      const workoutExercise = await addExerciseToWorkout(apiRequest, token, workout.id, exercise.id);
      await addSetToWorkout(apiRequest, token, workout.id, workoutExercise.id, {
        setIndex: 0,
        weightKg: 47.5,
        reps: 9,
      });
      await finishWorkoutViaApi(apiRequest, token, workout.id);

      await loginViaUi(page, USER_A.login, USER_A.password);
      await page.goto(`/cwiczenie/${exercise.id}`);

      const weightTile = page.getByRole("region", { name: "Ciężar" });
      await expect(weightTile).toBeVisible();

      // Domyślne 3M: treningu sprzed pół roku tu nie ma i kafel mówi to wprost,
      // zamiast rysować pusty wykres albo myślnik udający wartość.
      await expect(weightTile.getByText("Brak serii roboczych w tym zakresie.")).toBeVisible();

      // „Całość" go odsłania -- ta sama seria, ten sam kafel.
      await weightTile.getByRole("button", { name: "Całość" }).click();
      await expect(weightTile.getByText("Brak serii roboczych w tym zakresie.")).toHaveCount(0);
      await weightTile.getByRole("button", { name: "Tabela" }).click();
      await expect(weightTile.getByRole("cell", { name: "47.5" })).toBeVisible();
    } finally {
      await deleteWorkout(apiRequest, token, workout.id);
      await deleteExerciseViaApi(apiRequest, token, exercise.id);
    }
  });
});
