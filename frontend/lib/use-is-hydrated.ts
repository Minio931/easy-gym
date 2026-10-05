"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * `false` during server render and hydration, `true` afterwards.
 *
 * Needed because the whole session lives in localStorage: the server does not
 * know whether anyone is signed in, so without this flag the route guard
 * would see "no session" in the first render and bounce a signed-in user to
 * the login screen. useSyncExternalStore instead of useState+useEffect — the
 * same effect without a cascading re-render and without setState in an effect.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
