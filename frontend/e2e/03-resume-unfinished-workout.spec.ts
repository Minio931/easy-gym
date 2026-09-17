import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import { USER_A } from "./support/api";
import { addExerciseToWorkout, findExerciseId, startWorkoutViaApi } from "./support/api";

/**
 * §2 / §4 spec: `GET /api/workouts/active` -> 200 JEST wznowieniem -- bez
 * pytania, bez modala "czy wznowić?", sesja po prostu trwa. Trwałość lokalna
 * (localStorage, §4) musi też przeżyć zwykłe odświeżenie strony.
 */
test.describe("Wznowienie niedokończonego treningu", () => {
  test("trening rozpoczęty gdzie indziej pojawia się od razu po wejściu na /trening, bez pytania", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    // Trening "rozpoczęty gdzie indziej" symulujemy przez API -- ekran musi
    // go pokazać identycznie, jakby użytkownik sam go zaczął w tej karcie.
    await startWorkoutViaApi(apiRequest, userAToken.accessToken);

    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");

    // Żadnego modala/pytania o wznowienie.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/wznowić/i)).toHaveCount(0);

    await expect(page.getByRole("button", { name: "+ Dodaj ćwiczenie" })).toBeVisible();
    await expect(page.getByText(/Nie masz otwartego treningu/)).not.toBeVisible();
  });

  test("odświeżenie strony w trakcie treningu nie gubi sesji ani dodanego ćwiczenia", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    const workout = await startWorkoutViaApi(apiRequest, userAToken.accessToken);
    const exercise = await findExerciseId(apiRequest, userAToken.accessToken, "przysiad");
    await addExerciseToWorkout(apiRequest, userAToken.accessToken, workout.id, exercise.id);

    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");
    // .first() -- nazwa ćwiczenia może legalnie wystąpić więcej niż raz na
    // ekranie (np. karta + linijka meta gdzieś indziej); nie o to tu chodzi,
    // tylko o to, że w ogóle jest widoczna po odświeżeniu.
    await expect(page.getByText(exercise.name).first()).toBeVisible();

    await page.reload();

    await expect(page.getByText(exercise.name).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Dodaj ćwiczenie" })).toBeVisible();
  });

  test("trening trwający ponad 12h pokazuje 'od wczoraj' zamiast liczyć od zera", async ({
    page,
    apiRequest,
    userAToken,
  }) => {
    // §4: "Trening starszy niż 12 h" -- pasek kontekstu pokazuje datę startu,
    // nie kasujemy nic automatycznie. Trening startowany "wczoraj" przez API.
    const yesterday = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const res = await apiRequest.post(`${process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8081"}/api/workouts`, {
      headers: { Authorization: `Bearer ${userAToken.accessToken}` },
      data: { id: crypto.randomUUID(), startedAt: yesterday },
    });
    expect(res.ok()).toBeTruthy();

    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");

    await expect(page.getByText(/Trening trwa od wczoraj/i)).toBeVisible();
  });
});
