import { test as base, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { USER_A, USER_B, apiLogin, ensureNoActiveWorkout, type TokenPair } from "./api";

interface Fixtures {
  /** Osobny request context do wołań API poza przeglądarką (setup/teardown). */
  apiRequest: APIRequestContext;
  /** Token usera A (Minio), z gwarancją braku aktywnego treningu przed i po teście. */
  userAToken: TokenPair;
  /** Token usera B (Wojtur), tak samo posprzątany -- do scenariuszy izolacji. */
  userBToken: TokenPair;
}

// Parametr fixture'a nazywamy `provideFixture`, nie `use` -- eslint-plugin-react-hooks
// (react-hooks/rules-of-hooks) rozpoznaje identyfikator `use` jako hook Reacta
// niezależnie od kontekstu i fałszywie się tu uruchamia. Playwright nie wymaga
// literalnie tej nazwy, tylko roli drugiego argumentu.
export const test = base.extend<Fixtures>({
  apiRequest: async ({}, provideFixture) => {
    const context = await playwrightRequest.newContext();
    await provideFixture(context);
    await context.dispose();
  },
  userAToken: async ({ apiRequest }, provideFixture) => {
    const token = await apiLogin(apiRequest, USER_A.login, USER_A.password);
    await ensureNoActiveWorkout(apiRequest, token.accessToken);
    await provideFixture(token);
    await ensureNoActiveWorkout(apiRequest, token.accessToken);
  },
  userBToken: async ({ apiRequest }, provideFixture) => {
    const token = await apiLogin(apiRequest, USER_B.login, USER_B.password);
    await ensureNoActiveWorkout(apiRequest, token.accessToken);
    await provideFixture(token);
    await ensureNoActiveWorkout(apiRequest, token.accessToken);
  },
});

export { expect } from "@playwright/test";
