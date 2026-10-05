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
import { releaseLocalData } from "@/lib/sync/engine";
import { resetBodyWeightStore } from "@/lib/bodyweight/store";
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

  // Until hydration we know nothing — localStorage does not exist on the
  // server. "anonymous" at that point would bounce a signed-in user to the
  // login screen on every refresh.
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
    // Background token verification, once at app startup. Offline does NOT
    // log out — the refresh token lives 30 days, and the app must work
    // without signal (DESIGN.md §7.4).
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
    // Deliberately once after login, not on every access-token rotation.
  }, [status]);

  const signIn = useCallback(async (login: string, password: string) => {
    const tokens = await authApi.login({ login, password });
    // userId is known only from /api/me; until then the session has only the login.
    writeSession(sessionFromTokens(tokens, { userId: "", login }));
    try {
      const identity = await authApi.me();
      const current = readSession();
      if (current !== null) {
        writeSession({ ...current, ...identity });
      }
    } catch (error) {
      // Signed in offline is still signed in — userId will fill in on the
      // first successful /api/me.
      if (!(error instanceof OfflineError)) {
        throw error;
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    const current = readSession();
    // We push the pending queue BEFORE clearing the session — without a
    // token sync has no way to go through, and a workout done offline must
    // not die on logout. Offline `fetch` rejects immediately, so this does
    // not block.
    if (current !== null) {
      await releaseLocalData(current.userId);
    }
    writeSession(null);
    // The active-workout snapshot is tied to the account — it must not
    // stay on the device after logout and pop up for the next person.
    resetWorkoutStore();
    // The body-weight screen also keeps account data in the module memory —
    // without this the next person on this device would see someone else's
    // measurements until a reload.
    resetBodyWeightStore();
    if (current !== null) {
      // Best effort: invalidate the refresh token on the server. No
      // network must not block the local logout.
      try {
        await authApi.logout({ refreshToken: current.refreshToken });
      } catch {
        /* intentionally empty */
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
    throw new Error("useAuth must be called inside <AuthProvider>");
  }
  return context;
}
