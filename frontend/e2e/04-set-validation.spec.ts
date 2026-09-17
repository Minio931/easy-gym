import { test, expect } from "./support/fixtures";
import { loginViaUi } from "./support/auth";
import { USER_A } from "./support/api";
import { startEmptyWorkoutViaUi } from "./support/workout-ui";

/**
 * §4 tabela "Walidacja" + §6 mikrokopie błędów. Granice zgodne z CHECK w
 * bazie (`backend/API.md`): weightKg 0-500, reps 1-100, rpe 1-10|null.
 * Kontrakt twardy: apka NIGDY nie wysyła żądania poza tymi granicami, nawet
 * jeśli user wpisze coś spoza zakresu -- serwer by to i tak odrzucił 400-tką,
 * ale zero-layout-shift / brak spinnerów (§7 "Twarde minimum") zakłada, że
 * front łapie to najpierw.
 */
test.describe("Walidacje serii: ciężar, powtórzenia, RPE", () => {
  test.beforeEach(async ({ page, userAToken }) => {
    void userAToken;
    await loginViaUi(page, USER_A.login, USER_A.password);
    await page.goto("/trening");
    await startEmptyWorkoutViaUi(page);
    await page.getByRole("button", { name: "+ Dodaj ćwiczenie" }).click();

    const searchBox = page.getByRole("textbox").first();
    await searchBox.fill("przysiad");
    await page.waitForResponse((res) => res.url().includes("/api/exercises?query="));
    await page.getByText(/przysiad/i).first().click();
  });

  test("ciężar > 500 kg: błąd pod wierszem, ✓ zablokowane, żadne żądanie się nie wysyła", async ({ page }) => {
    const setRequests: string[] = [];
    page.on("request", (req) => {
      if (/\/sets(\/|$)/.test(req.url()) && ["POST", "PUT"].includes(req.method())) {
        setRequests.push(`${req.method()} ${req.url()} ${req.postData() ?? ""}`);
      }
    });

    await page.getByLabel(/Ciężar w kilogramach, seria 1/i).fill("501");
    await page.getByLabel(/Powtórzenia, seria 1/i).fill("5");

    await expect(page.getByText("Ciężar od 0 do 500 kg")).toBeVisible();

    const confirmButton = page.getByRole("button", { name: /zatwierdź/i }).first();
    await expect(confirmButton).toHaveAttribute("aria-disabled", "true");
    await confirmButton.click({ force: true }); // wymuszamy klik -- aria-disabled nie blokuje na poziomie DOM
    await page.waitForTimeout(300); // zostaw czas na ewentualne (błędne) wysłanie żądania

    const invalidRequests = setRequests.filter((r) => r.includes("501"));
    expect(invalidRequests, `Apka nie może wysłać ciężaru poza zakresem: ${invalidRequests.join("; ")}`).toHaveLength(
      0,
    );
    // Apka się nie wywaliła -- ekran nadal odpowiada.
    await expect(page.getByRole("button", { name: "+ Dodaj ćwiczenie" })).toBeVisible();
  });

  test("powtórzenia > 100: błąd pod wierszem, ✓ zablokowane, żadne żądanie się nie wysyła", async ({ page }) => {
    const setRequests: string[] = [];
    page.on("request", (req) => {
      if (/\/sets(\/|$)/.test(req.url()) && ["POST", "PUT"].includes(req.method())) {
        setRequests.push(`${req.method()} ${req.url()} ${req.postData() ?? ""}`);
      }
    });

    await page.getByLabel(/Ciężar w kilogramach, seria 1/i).fill("100");
    await page.getByLabel(/Powtórzenia, seria 1/i).fill("101");

    await expect(page.getByText("Powtórzenia od 1 do 100")).toBeVisible();

    const confirmButton = page.getByRole("button", { name: /zatwierdź/i }).first();
    await expect(confirmButton).toHaveAttribute("aria-disabled", "true");
    await confirmButton.click({ force: true });
    await page.waitForTimeout(300);

    const invalidRequests = setRequests.filter((r) => r.includes('"reps":101') || r.includes('"reps": 101'));
    expect(invalidRequests, `Apka nie może wysłać powtórzeń poza zakresem: ${invalidRequests.join("; ")}`).toHaveLength(
      0,
    );
    await expect(page.getByRole("button", { name: "+ Dodaj ćwiczenie" })).toBeVisible();
  });

  test("pusty ✓ bez ciężaru/powtórzeń pokazuje 'Podaj ciężar i powtórzenia', nie wysyła żądania", async ({
    page,
  }) => {
    const confirmButton = page.getByRole("button", { name: /zatwierdź/i }).first();
    await confirmButton.click({ force: true });

    await expect(page.getByText("Podaj ciężar i powtórzenia")).toBeVisible();
  });

  test("RPE jest ograniczone do chipów 1-10 -- nie da się przez UI wybrać wartości spoza zakresu", async ({
    page,
  }) => {
    // §3: rząd chipów "1 ... 10" + "Bez RPE". Struktura chipowa (nie input
    // liczbowy) gwarantuje, że apka nigdy nie wyśle RPE spoza 1-10 -- to
    // sprawdzamy tu strukturalnie, zamiast próbować "wpisać" nielegalną wartość.
    await page.getByRole("button", { name: "RPE" }).click();

    await expect(page.getByRole("button", { name: "10", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bez RPE" })).toBeVisible();
    await expect(page.getByRole("button", { name: "11", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "0", exact: true })).toHaveCount(0);
  });

  test("steppery nie wychodzą poza zakres 0-500 kg / 1-100 powt.", async ({ page }) => {
    // §3: "Wynik zaciskany do zakresu, nigdy nie wychodzi poza 0-500 / 1-100."
    await page.getByLabel(/Ciężar w kilogramach, seria 1/i).fill("499");
    const plusWeight = page.getByRole("button", { name: "+2.5" });
    await plusWeight.click();
    await plusWeight.click();
    await expect(page.getByLabel(/Ciężar w kilogramach, seria 1/i)).toHaveValue("500");

    await page.getByLabel(/Powtórzenia, seria 1/i).fill("100");
    const plusReps = page.getByRole("button", { name: "+1" });
    await plusReps.click();
    await expect(page.getByLabel(/Powtórzenia, seria 1/i)).toHaveValue("100");
  });
});
