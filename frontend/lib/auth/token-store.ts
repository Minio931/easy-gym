import type { TokenPairResponse } from "@/types/api";

/**
 * Token pair storage. localStorage, not httpOnly cookie — a deliberate
 * decision: the backend returns tokens in the body, and the app has to work
 * offline as a PWA, so it must hold them on the client anyway. The cost is
 * XSS exposure; we limit it by not injecting HTML from data anywhere and
 * not loading external scripts.
 *
 * The module is the store for useSyncExternalStore: `readSession()` must
 * return the same value BY REFERENCE until the session changes (otherwise
 * React enters a render loop), hence the cache instead of parsing JSON on
 * every call. Writes go exclusively through `writeSession` — the `storage`
 * event from another tab is the only way to prevent tabs from logging each
 * other out after a refresh-token rotation.
 */

const STORAGE_KEY = "easy-gym.auth";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. Computed from expiresInSeconds at the moment the pair was received. */
  accessTokenExpiresAt: number;
  userId: string;
  login: string;
}

const listeners = new Set<() => void>();

/** `undefined` = we have not read localStorage yet. */
let cached: StoredSession | null | undefined = undefined;

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.refreshToken === "string" &&
    typeof candidate.accessTokenExpiresAt === "number" &&
    typeof candidate.userId === "string" &&
    typeof candidate.login === "string"
  );
}

function parseFromStorage(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    // A corrupted entry is treated as no session — a login screen is
    // better than an exception at app startup.
    return null;
  }
}

export function readSession(): StoredSession | null {
  if (cached === undefined) {
    cached = parseFromStorage();
  }
  return cached;
}

/** Snapshot for server render: the server never knows the session. */
export function readServerSession(): null {
  return null;
}

export function writeSession(session: StoredSession | null): void {
  cached = session;
  if (typeof window !== "undefined") {
    if (session === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  }
  notify();
}

/** Build a session from the server response; identity carries over from the previous one. */
export function sessionFromTokens(
  tokens: TokenPairResponse,
  identity: { userId: string; login: string },
  now: number = Date.now(),
): StoredSession {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessTokenExpiresAt: now + tokens.expiresInSeconds * 1000,
    userId: identity.userId,
    login: identity.login,
  };
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

if (typeof window !== "undefined") {
  // Refresh-token rotation in another tab — we adopt the new pair instead
  // of continuing to use the invalidated one.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) {
      return;
    }
    cached = parseFromStorage();
    notify();
  });
}
