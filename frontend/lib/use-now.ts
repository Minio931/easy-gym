"use client";

import { useSyncExternalStore } from "react";

/**
 * Wspólny zegar sekundowy dla całej apki (czas trwania sesji, „trening trwa
 * od wczoraj"). Jeden `setInterval` na wszystkie liczniki zamiast jednego na
 * komponent, a migawka to liczba sekund — prymityw, więc React re-renderuje
 * dopiero przy zmianie sekundy, nie przy każdym ticku.
 *
 * Czas bierze się z `Date.now()`, nigdy z licznika dekrementowanego w
 * interwale: uśpiona zakładka wstrzymuje `setInterval`, ale nie zegar.
 */

const listeners = new Set<() => void>();
let seconds = Math.floor(Date.now() / 1000);
let interval: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const next = Math.floor(Date.now() / 1000);
  if (next === seconds) {
    return;
  }
  seconds = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (interval === null) {
    interval = setInterval(tick, 500);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", tick);
  }
  return () => {
    listeners.delete(listener);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", tick);
    }
    if (listeners.size === 0 && interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  };
}

function getSnapshot(): number {
  return seconds;
}

function getServerSnapshot(): number {
  return 0;
}

/** Sekundy epoki, odświeżane co sekundę. */
export function useNowSeconds(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Sekundy od podanego momentu ISO; `0` przed hydracją i dla dat z przyszłości. */
export function useElapsedSeconds(startedAt: string | null): number {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (startedAt === null || now === 0) {
    return 0;
  }
  return Math.max(0, now - Math.floor(new Date(startedAt).getTime() / 1000));
}
