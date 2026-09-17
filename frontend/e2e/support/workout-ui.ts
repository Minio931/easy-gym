import type { Page } from "@playwright/test";

/**
 * Klika "Rozpocznij trening" i czeka na realny `POST /api/workouts`, zanim
 * test idzie dalej.
 *
 * Dlaczego to jest potrzebne, mimo że spec §2 explicite każe UI renderować
 * się NATYCHMIAST (lokalny obiekt, serwer tylko uzgadnia): to zachowanie
 * apki jest poprawne i go nie omijamy w asercjach UI. Problem jest inny --
 * gdy test i tak kończy się (asercją albo błędem) zanim to żądanie w tle
 * zdąży dolecieć, fixture `userAToken` sprząta stan (`ensureNoActiveWorkout`)
 * PRZED tym, jak spóźniony POST w ogóle dotrze do serwera -- kolejny test
 * dziedziczy fantomowy aktywny trening i sam się wywraca na czymś zupełnie
 * innym (np. `+ Dodaj ćwiczenie` nie zdąży się pojawić, bo apka pokazuje od
 * razu wznowioną sesję zamiast ekranu startu). Zaobserwowane empirycznie:
 * pełny przebieg 42 testów miał 18 failów przez to skażenie międzytestowe;
 * ten sam plik uruchomiony osobno przechodził 3/3. Ten helper usuwa wyścig
 * u źródła, nie w cudzym kodzie.
 */
export async function startEmptyWorkoutViaUi(page: Page): Promise<void> {
  const created = page.waitForResponse(
    (res) => res.url().endsWith("/api/workouts") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Rozpocznij trening" }).click();
  await created;
}
