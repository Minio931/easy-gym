import { ApiError, OfflineError } from "@/lib/api/errors";
import {
  readSession,
  sessionFromTokens,
  writeSession,
  type StoredSession,
} from "@/lib/auth/token-store";
import type { ApiErrorBody, TokenPairResponse } from "@/types/api";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/** Zapas na zegar klienta i czas lotu requestu -- odświeżamy trochę przed wygaśnięciem. */
const EXPIRY_SKEW_MS = 30_000;

const REFRESH_LOCK = "easy-gym.auth.refresh";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Domyślnie true. Endpointy auth wołają z false, żeby nie zapętlić refreshu. */
  authenticated?: boolean;
  signal?: AbortSignal;
}

/** Surowy request bez logiki tokenów. Nie używać poza tym modułem. */
async function rawRequest<T>(path: string, options: RequestOptions, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (accessToken !== undefined) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted === true) {
      // Żądanie przerwane przez wołającego (odmontowany komponent, nowa fraza
      // w wyszukiwarce) NIE jest brakiem sieci. Zamiana go na OfflineError
      // pokazywałaby „jesteś offline" za każdym razem, gdy user coś dopisze.
      throw cause;
    }
    // fetch odrzucony bez odpowiedzi = sieć, nie serwer. W tej apce to stan
    // normalny (siłownia w suterenie), nie awaria.
    throw new OfflineError(cause);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  if (response.status === 204) {
    // Brak treści; wołający typuje taki endpoint jako void.
    return undefined as unknown as T;
  }
  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    return typeof body.error === "string" ? body.error : response.statusText;
  } catch {
    return response.statusText;
  }
}

/* ------------------------------------------------------------------ *
 * Odświeżanie tokenu
 *
 * Backend ROTUJE refresh token przy każdym /api/auth/refresh -- stary
 * natychmiast przestaje działać. Dwa równoległe odświeżenia = drugie dostaje
 * 401 i wylogowuje użytkownika w trakcie serii. Dlatego dwie bariery:
 *   1. jeden in-flight refresh w obrębie zakładki (`inflightRefresh`),
 *   2. Web Locks między zakładkami -- kto wejdzie drugi, zastanie w
 *      localStorage już nową parę i jej użyje zamiast odświeżać ponownie.
 * ------------------------------------------------------------------ */

let inflightRefresh: Promise<StoredSession | null> | null = null;

function refreshSession(staleAccessToken: string): Promise<StoredSession | null> {
  if (inflightRefresh !== null) {
    return inflightRefresh;
  }
  const pending = withRefreshLock(() => performRefresh(staleAccessToken)).finally(() => {
    inflightRefresh = null;
  });
  inflightRefresh = pending;
  return pending;
}

function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    // LockGrantedCallback<T> zwraca T dosłownie, więc dla callbacku
    // asynchronicznego request() daje Promise<Promise<T>> -- .then je spłaszcza.
    return navigator.locks.request<Promise<T>>(REFRESH_LOCK, task).then((result) => result);
  }
  return task();
}

async function performRefresh(staleAccessToken: string): Promise<StoredSession | null> {
  const current = readSession();
  if (current === null) {
    return null;
  }
  // Inna zakładka odświeżyła, zanim weszliśmy w lock -- para jest już świeża.
  if (current.accessToken !== staleAccessToken) {
    return current;
  }

  try {
    const tokens = await rawRequest<TokenPairResponse>("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: current.refreshToken },
      authenticated: false,
    });
    const next = sessionFromTokens(tokens, { userId: current.userId, login: current.login });
    writeSession(next);
    return next;
  } catch (error) {
    if (error instanceof OfflineError) {
      // Brak sieci NIE jest powodem do wylogowania -- refresh token żyje 30 dni.
      throw error;
    }
    writeSession(null);
    return null;
  }
}

async function validAccessToken(): Promise<string> {
  const session = readSession();
  if (session === null) {
    throw new ApiError(401, "Brak sesji");
  }
  if (session.accessTokenExpiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return session.accessToken;
  }
  const refreshed = await refreshSession(session.accessToken);
  if (refreshed === null) {
    throw new ApiError(401, "Sesja wygasła");
  }
  return refreshed.accessToken;
}

/**
 * Jedyne wejście do API w całej apce. Sam pilnuje access tokenu: odświeża
 * proaktywnie przed wygaśnięciem i reaktywnie raz, jeśli serwer mimo to
 * odpowie 401 (np. restart backendu ze zmienionym sekretem).
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (options.authenticated === false) {
    return rawRequest<T>(path, options);
  }

  const accessToken = await validAccessToken();
  try {
    return await rawRequest<T>(path, options, accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
    const refreshed = await refreshSession(accessToken);
    if (refreshed === null) {
      throw new ApiError(401, "Sesja wygasła");
    }
    return rawRequest<T>(path, options, refreshed.accessToken);
  }
}
