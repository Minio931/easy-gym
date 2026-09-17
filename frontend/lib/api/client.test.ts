/**
 * Testy klienta API. Skupione na jednej rzeczy, która w tej apce realnie boli:
 * backend ROTUJE refresh token przy każdym /api/auth/refresh, więc dwa
 * równoległe odświeżenia = drugie dostaje 401 i wylogowuje użytkownika w
 * połowie serii. Test sprawdza, że równoległe żądania odświeżają token
 * DOKŁADNIE RAZ.
 *
 * Środowisko node nie ma navigator.locks -- testowana jest więc ścieżka
 * awaryjna (jeden in-flight refresh w obrębie zakładki). Blokada między
 * zakładkami to druga bariera, nieosiągalna w teście jednowątkowym.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface StoredJson {
  [key: string]: string;
}

function installLocalStorage(): void {
  const data: StoredJson = {};
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = value;
      },
      removeItem: (key: string) => {
        delete data[key];
      },
      clear: () => {
        for (const key of Object.keys(data)) delete data[key];
      },
    },
  });
}

type FetchSignature = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function freshModules() {
  vi.resetModules();
  const tokenStore = await import("@/lib/auth/token-store");
  const client = await import("@/lib/api/client");
  const errors = await import("@/lib/api/errors");
  return { tokenStore, client, errors };
}

const EXPIRED_SESSION = {
  accessToken: "stary-access",
  refreshToken: "stary-refresh",
  accessTokenExpiresAt: 0, // dawno wygasł -> wymusza proaktywny refresh
  userId: "u-1",
  login: "Minio",
};

beforeEach(() => {
  installLocalStorage();
  globalThis.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("odświeża token dokładnie raz przy równoległych żądaniach (rotacja!)", async () => {
    const { tokenStore, client } = await freshModules();
    tokenStore.writeSession(EXPIRED_SESSION);

    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/auth/refresh")) {
        refreshCalls += 1;
        // Opóźnienie sieci: bez serializacji drugie żądanie zdążyłoby wejść.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return jsonResponse(200, {
          accessToken: "nowy-access",
          refreshToken: "nowy-refresh",
          expiresInSeconds: 900,
        });
      }
      return jsonResponse(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      client.apiFetch("/api/me"),
      client.apiFetch("/api/me"),
      client.apiFetch("/api/me"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(tokenStore.readSession()?.refreshToken).toBe("nowy-refresh");
    expect(tokenStore.readSession()?.accessToken).toBe("nowy-access");
  });

  it("dokłada nagłówek Authorization ze świeżym tokenem", async () => {
    const { tokenStore, client } = await freshModules();
    tokenStore.writeSession({ ...EXPIRED_SESSION, accessTokenExpiresAt: Date.now() + 600_000 });

    const fetchMock = vi.fn<FetchSignature>(async () =>
      jsonResponse(200, { userId: "u-1", login: "Minio" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await client.apiFetch("/api/me");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer stary-access");
  });

  it("po 401 z serwera odświeża token i ponawia żądanie raz", async () => {
    const { tokenStore, client } = await freshModules();
    tokenStore.writeSession({ ...EXPIRED_SESSION, accessTokenExpiresAt: Date.now() + 600_000 });

    let meCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/auth/refresh")) {
        return jsonResponse(200, {
          accessToken: "nowy-access",
          refreshToken: "nowy-refresh",
          expiresInSeconds: 900,
        });
      }
      meCalls += 1;
      return meCalls === 1
        ? jsonResponse(401, { error: "Token wygasł" })
        : jsonResponse(200, { userId: "u-1", login: "Minio" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.apiFetch("/api/me")).resolves.toEqual({ userId: "u-1", login: "Minio" });
    expect(meCalls).toBe(2);
  });

  it("odrzucony refresh (401) czyści sesję -- to jedyna droga do wylogowania", async () => {
    const { tokenStore, client } = await freshModules();
    tokenStore.writeSession(EXPIRED_SESSION);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { error: "Nieważny refresh token" })),
    );

    await expect(client.apiFetch("/api/me")).rejects.toThrow();
    expect(tokenStore.readSession()).toBeNull();
  });

  it("brak sieci NIE wylogowuje -- offline to stan normalny, nie awaria", async () => {
    const { tokenStore, client, errors } = await freshModules();
    tokenStore.writeSession(EXPIRED_SESSION);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(client.apiFetch("/api/me")).rejects.toBeInstanceOf(errors.OfflineError);
    expect(tokenStore.readSession()?.refreshToken).toBe("stary-refresh");
  });

  it("żądania bez uwierzytelnienia nie ruszają sesji ani refreshu", async () => {
    const { client } = await freshModules();

    const fetchMock = vi.fn<FetchSignature>(async () =>
      jsonResponse(200, { accessToken: "a", refreshToken: "r", expiresInSeconds: 900 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await client.apiFetch("/api/auth/login", {
      method: "POST",
      body: { login: "Minio", password: "x" },
      authenticated: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
