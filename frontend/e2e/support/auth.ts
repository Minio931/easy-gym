import type { Page } from "@playwright/test";

/** Loguje się przez prawdziwy formularz `/logowanie` (nie wstrzykuje tokenu
 * do localStorage) -- to jest jedyny ekran auth apki (PROMPT.md §0), a
 * omijanie go pominęłoby ewentualne regresje w samym logowaniu. */
export async function loginViaUi(page: Page, login: string, password: string): Promise<void> {
  await page.goto("/logowanie");
  await page.getByLabel("Login").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: /Zaloguj/ }).click();
  await page.waitForURL(/\/pulpit/, { timeout: 15_000 });
}
