"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared second-tick clock for the whole app (session duration, "workout
 * running since yesterday"). One `setInterval` for all counters instead of
 * one per component, and the snapshot is a number of seconds — a primitive,
 * so React re-renders only when the second changes, not on every tick.
 *
 * Time comes from `Date.now()`, never from a counter decremented in the
 * interval: a sleeping tab pauses `setInterval`, but not the clock.
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

/** Epoch seconds, refreshed every second. */
export function useNowSeconds(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Seconds since the given ISO instant; `0` before hydration and for future dates. */
export function useElapsedSeconds(startedAt: string | null): number {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (startedAt === null || now === 0) {
    return 0;
  }
  return Math.max(0, now - Math.floor(new Date(startedAt).getTime() / 1000));
}
