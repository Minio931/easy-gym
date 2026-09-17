import { request } from "@playwright/test";
import { API_URL } from "./support/api";

/**
 * Sprawdza, zanim ruszy jakikolwiek test, że backend faktycznie odpowiada.
 * `webServer` w playwright.config.ts pilnuje tylko frontu (port 3001) -- to
 * jest odpowiednik dla API (port z PLAYWRIGHT_API_URL, domyślnie :8081).
 * Failuje szybko z czytelnym komunikatem zamiast rozjeżdżać się w każdym
 * pojedynczym teście osobnym, mylącym błędem sieciowym.
 */
export default async function globalSetup(): Promise<void> {
  const context = await request.newContext();
  try {
    const response = await context.get(`${API_URL}/actuator/health`, { timeout: 5_000 });
    if (!response.ok()) {
      throw new Error(`status ${response.status()}`);
    }
    const body = (await response.json()) as { status?: string };
    if (body.status !== "UP") {
      throw new Error(`nieoczekiwany status zdrowia: ${JSON.stringify(body)}`);
    }
  } catch (error) {
    throw new Error(
      `Backend pod ${API_URL} nie odpowiada na /actuator/health -- testy E2E etapu 4 potrzebują ` +
        `żywego API (konta Minio/Wojtur). Uruchom backend przed \`npm run test:e2e\`. ` +
        `Szczegóły: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await context.dispose();
  }
}
