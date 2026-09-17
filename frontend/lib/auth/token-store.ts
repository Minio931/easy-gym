import type { TokenPairResponse } from "@/types/api";

/**
 * Przechowywanie pary tokenów. localStorage, nie cookie httpOnly -- świadoma
 * decyzja: backend oddaje tokeny w body, a apka ma działać offline jako PWA,
 * więc i tak musi trzymać je po stronie klienta. Kosztem jest podatność na
 * XSS; ograniczamy ją tym, że nigdzie nie wstrzykujemy HTML-a z danych i nie
 * ładujemy skryptów z zewnątrz.
 *
 * Moduł jest sklepem dla useSyncExternalStore: `readSession()` musi zwracać
 * REFERENCYJNIE tę samą wartość, dopóki sesja się nie zmieniła (inaczej React
 * wpada w pętlę renderów), stąd cache zamiast parsowania JSON-a przy każdym
 * wywołaniu. Zapis idzie wyłącznie przez `writeSession` -- zdarzenie
 * `storage` z innej zakładki jest jedynym sposobem, żeby zakładki nie
 * wylogowały się nawzajem po rotacji refresh tokenu.
 */

const STORAGE_KEY = "easy-gym.auth";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. Liczone z expiresInSeconds w momencie odebrania pary. */
  accessTokenExpiresAt: number;
  userId: string;
  login: string;
}

const listeners = new Set<() => void>();

/** `undefined` = jeszcze nie czytaliśmy localStorage. */
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
    // Uszkodzony wpis traktujemy jak brak sesji -- lepiej ekran logowania niż
    // wyjątek przy starcie apki.
    return null;
  }
}

export function readSession(): StoredSession | null {
  if (cached === undefined) {
    cached = parseFromStorage();
  }
  return cached;
}

/** Migawka dla renderu serwerowego: serwer nigdy nie zna sesji. */
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

/** Zbudowanie sesji z odpowiedzi serwera; tożsamość zostaje z poprzedniej sesji. */
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
  // Rotacja refresh tokenu w innej zakładce -- adoptujemy nową parę zamiast
  // dalej używać unieważnionej.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) {
      return;
    }
    cached = parseFromStorage();
    notify();
  });
}
