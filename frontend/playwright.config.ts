import { defineConfig, devices } from "@playwright/test";

/**
 * E2E dla etapu 4 (ekran aktywnego treningu, `frontend/PROMPT.md` §11).
 *
 * Świadomie NIE startujemy tu własnego serwera front/API -- oba żyją poza
 * tym procesem (front: `npm run dev -p 3001` z `NEXT_PUBLIC_API_URL` na żywe
 * API; backend: Spring Boot). `webServer` niżej istnieje wyłącznie po to,
 * żeby Playwright *sprawdził* dostępność `baseURL` przed testami --
 * `reuseExistingServer: true` sprawia, że gdy port już odpowiada, `command`
 * nigdy się nie uruchamia. Gdyby port NIE odpowiadał, `command` musi
 * zawieść głośno zamiast po cichu odpalić drugi `next dev` na tym samym
 * porcie (dwa procesy na 3001 to gorszy stan niż czytelny błąd).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "./e2e/.report", open: "never" }],
  ],
  // Sprawdza dostępność backendu (health) przed pierwszym testem -- patrz e2e/global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      'echo "front dev (npm run dev -- -p 3001) nie odpowiada pod ' +
      baseURL +
      ' -- ten config celowo go NIE startuje (aplikacja działa równolegle w innym procesie); uruchom serwer ręcznie i spróbuj ponownie" 1>&2 && exit 1',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 5_000,
  },
  projects: [
    {
      name: "mobile-390",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
