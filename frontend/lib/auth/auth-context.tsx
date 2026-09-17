"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import * as authApi from "@/lib/api/auth";
import { ApiError, OfflineError } from "@/lib/api/errors";
import {
  readServerSession,
  readSession,
  sessionFromTokens,
  subscribe,
  writeSession,
} from "@/lib/auth/token-store";
import { useIsHydrated } from "@/lib/use-is-hydrated";
import { resetWorkoutStore } from "@/lib/workout/store";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthUser {
  userId: string;
  login: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribe, readSession, readServerSession);
  const isHydrated = useIsHydrated();

  // Dopóki nie ma hydracji, nie wiemy nic -- localStorage nie istnieje na
  // serwerze. "anonymous" w tym momencie oznaczałoby wyrzucenie zalogowanego
  // użytkownika na ekran logowania przy każdym odświeżeniu.
  const status: AuthStatus = !isHydrated
    ? "loading"
    : session === null
      ? "anonymous"
      : "authenticated";

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    let cancelled = false;
    // Weryfikacja tokenu w tle, raz przy starcie apki. Offline NIE
    // wylogowuje -- refresh token żyje 30 dni, a apka ma działać bez zasięgu
    // (DESIGN.md §7.4).
    void authApi
      .me()
      .then((identity) => {
        const current = readSession();
        if (cancelled || current === null || current.userId === identity.userId) {
          return;
        }
        writeSession({ ...current, ...identity });
      })
      .catch((error: unknown) => {
        if (!cancelled && error instanceof ApiError && error.status === 401) {
          writeSession(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // Celowo raz po zalogowaniu, nie przy każdej rotacji access tokenu.
  }, [status]);

  const signIn = useCallback(async (login: string, password: string) => {
    const tokens = await authApi.login({ login, password });
    // userId znamy dopiero z /api/me; do tego czasu sesja ma sam login.
    writeSession(sessionFromTokens(tokens, { userId: "", login }));
    try {
      const identity = await authApi.me();
      const current = readSession();
      if (current !== null) {
        writeSession({ ...current, ...identity });
      }
    } catch (error) {
      // Zalogowany offline to wciąż zalogowany -- userId uzupełni się przy
      // pierwszym udanym /api/me.
      if (!(error instanceof OfflineError)) {
        throw error;
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    const current = readSession();
    writeSession(null);
    // Migawka aktywnego treningu jest przypisana do konta — nie może zostać na
    // urządzeniu po wylogowaniu i wyskoczyć następnej osobie.
    resetWorkoutStore();
    if (current !== null) {
      // Best effort: unieważnienie refresh tokenu po stronie serwera. Brak
      // sieci nie może zablokować wylogowania lokalnie.
      try {
        await authApi.logout({ refreshToken: current.refreshToken });
      } catch {
        /* celowo puste */
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session === null ? null : { userId: session.userId, login: session.login },
      signIn,
      signOut,
    }),
    [status, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth musi być wywołane wewnątrz <AuthProvider>");
  }
  return context;
}
