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

/** Margin for client clock and request flight time — we refresh a bit before expiry. */
const EXPIRY_SKEW_MS = 30_000;

const REFRESH_LOCK = "easy-gym.auth.refresh";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Default true. Auth endpoints call with false to avoid looping the refresh. */
  authenticated?: boolean;
  signal?: AbortSignal;
}

/** Raw request without token logic. Do not use outside this module. */
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
      // A request aborted by the caller (unmounted component, new search
      // phrase) is NOT a no-network. Converting it to OfflineError would
      // show "you are offline" every time the user types another character.
      throw cause;
    }
    // fetch rejected without a response = network, not server. In this app
    // that is a normal state (basement gym), not a failure.
    throw new OfflineError(cause);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  if (response.status === 204) {
    // No body; the caller types such an endpoint as void.
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
 * Token refresh
 *
 * The backend ROTATES the refresh token on every /api/auth/refresh — the
 * old one immediately stops working. Two parallel refreshes = the second
 * gets a 401 and logs the user out mid-set. Hence two barriers:
 *   1. one in-flight refresh within a tab (`inflightRefresh`),
 *   2. Web Locks across tabs — whoever enters second finds the new pair
 *      already in localStorage and uses it instead of refreshing again.
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
    // LockGrantedCallback<T> returns T literally, so for an async callback
    // request() yields Promise<Promise<T>> — `.then` flattens it.
    return navigator.locks.request<Promise<T>>(REFRESH_LOCK, task).then((result) => result);
  }
  return task();
}

async function performRefresh(staleAccessToken: string): Promise<StoredSession | null> {
  const current = readSession();
  if (current === null) {
    return null;
  }
  // Another tab refreshed before we entered the lock — the pair is fresh.
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
      // No network is NOT a reason to log out — the refresh token lives 30 days.
      throw error;
    }
    writeSession(null);
    return null;
  }
}

async function validAccessToken(): Promise<string> {
  const session = readSession();
  if (session === null) {
    throw new ApiError(401, "No session");
  }
  if (session.accessTokenExpiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return session.accessToken;
  }
  const refreshed = await refreshSession(session.accessToken);
  if (refreshed === null) {
    throw new ApiError(401, "Session expired");
  }
  return refreshed.accessToken;
}

/**
 * Single entry point to the API in the whole app. Manages the access token
 * itself: refreshes proactively before expiry and reactively once if the
 * server still responds 401 (e.g. backend restart with a changed secret).
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
      throw new ApiError(401, "Session expired");
    }
    return rawRequest<T>(path, options, refreshed.accessToken);
  }
}
