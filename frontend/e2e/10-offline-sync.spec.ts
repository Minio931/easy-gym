import { loginViaUi } from "./support/auth";
import { getActiveWorkout, USER_A } from "./support/api";
import { expect, test } from "./support/fixtures";

/**
 * Etap 5: cała sesja bez zasięgu ma dojechać na serwer po odzyskaniu sieci.
 *
 * To jest test przeciwko najgorszemu możliwemu zachowaniu tej apki: siłownia
 * w suterenie, godzina treningu zapisana „na oko" w przeglądarce i zero śladu
 * po tym na serwerze. Dlatego asercje sprawdzają **serwer przez API**, nie to,
 * co apka rysuje na ekranie — ekran pokazywałby swoją lokalną prawdę także
 * wtedy, gdyby synchronizacja w ogóle nie działała.
 *
 * Service worker jest tu poza zasięgiem: e2e chodzą po `next dev`, gdzie SW
 * celowo się nie rejestruje (patrz components/shell/service-worker.tsx).
 * Ten test sprawdza warstwę danych (Dexie + `POST /api/sync`), nie powłokę.
 */
test.describe("Etap 5: praca bez zasięgu i synchronizacja", () => {
  test("trening zrobiony offline trafia na serwer po powrocie sieci", async ({
    page,
    context,
    userAToken,
    apiRequest,
  }) => {
    // Pierwsza synchronizacja leci już na `/pulpit`, zaraz po zalogowaniu —
    // nasłuch musi więc powstać PRZED logowaniem, inaczej test czeka na zdarzenie,
    // które zdążyło się wydarzyć. Ten zaciąg przynosi m.in. katalog ćwiczeń
    // (globalne mają `userId: null` i też przychodzą), dzięki czemu wyszukiwarka
    // zadziała potem bez sieci.
    const firstSync = page.waitForResponse(
      (res) => res.url().endsWith("/api/sync") && res.request().method() === "POST",
    );
    await loginViaUi(page, USER_A.login, USER_A.password);
    await firstSync;
    await page.goto("/trening");
    // Odpowiedź musi jeszcze wylądować w Dexie.
    await expect(page.getByRole("button", { name: "Rozpocznij trening" })).toBeVisible();
    await page.waitForTimeout(1_000);

    // --- Od tego miejsca: brak zasięgu ---
    await context.setOffline(true);

    await page.getByRole("button", { name: "Rozpocznij trening" }).click();
    // Ekran działa natychmiast, bez czekania na serwer (spec §2).
    await expect(page.getByRole("button", { name: "+ Dodaj ćwiczenie" })).toBeVisible();
    await expect(page.getByText("Offline")).toBeVisible();

    // Wyszukiwarka bez sieci jedzie z lokalnego katalogu — gdyby jej nie było,
    // offline dałoby się zacząć trening, ale nie dodać do niego ćwiczenia.
    await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();
    await page.getByRole("textbox").first().fill("wyciskanie");
    const result = page.getByText(/wyciskanie/i).first();
    await expect(result).toBeVisible();
    await result.click();

    await page.getByLabel(/Ciężar w kilogramach, seria 1/i).fill("72.5");
    await page.getByLabel(/Powtórzenia, seria 1/i).fill("5");
    await page.getByRole("button", { name: /zatwierdź/i }).first().click();
    await expect(page.getByText("72.5").first()).toBeVisible();

    // Serwer nadal nic o tym nie wie — to pointa całego etapu.
    expect(
      await getActiveWorkout(apiRequest, userAToken.accessToken),
      "serwer nie powinien znać treningu zrobionego offline",
    ).toBeNull();

    // --- Sieć wraca ---
    await context.setOffline(false);
    // `setOffline(false)` zmienia `navigator.onLine`; zdarzenie wysyłamy jawnie,
    // bo to ono jest wyzwalaczem synchronizacji w apce.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
    });

    // Trening musi pojawić się na serwerze RAZEM z serią — sam nagłówek bez
    // serii znaczyłby, że kolejność stosowania kluczy obcych się sypie.
    await expect
      .poll(
        async () => {
          const active = await getActiveWorkout(apiRequest, userAToken.accessToken);
          if (active === null) {
            return "brak treningu";
          }
          const exercises = active.exercises as { sets: { weightKg: number }[] }[] | undefined;
          const sets = exercises?.flatMap((exercise) => exercise.sets) ?? [];
          return sets.map((set) => set.weightKg).join(",");
        },
        { timeout: 25_000, message: "trening z offline nie dojechał na serwer" },
      )
      .toBe("72.5");

    // Kolejka pusta => pigułka znika. Cisza jest normą (DESIGN §7.4).
    await expect(page.getByText(/w kolejce/)).toHaveCount(0);
  });
});
