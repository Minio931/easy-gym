"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * `false` w renderze serwerowym i w trakcie hydracji, `true` potem.
 *
 * Potrzebne, bo cała sesja siedzi w localStorage: serwer nie wie, czy ktoś
 * jest zalogowany, więc bez tego flagi guard tras zobaczyłby "brak sesji" w
 * pierwszym renderze i przerzuciłby zalogowanego użytkownika na logowanie.
 * useSyncExternalStore zamiast useState+useEffect -- ten sam efekt bez
 * kaskadowego re-renderu i bez setState w efekcie.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
