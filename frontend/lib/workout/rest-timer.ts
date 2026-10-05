"use client";

import { useSyncExternalStore } from "react";
import {
  maybeRequestNotificationPermission,
  playRestEndSound,
  showRestEndNotification,
  vibrate,
} from "@/lib/workout/rest-signals";

/**
 * Rest timer. Lives in the module, not in the exercise-card component —
 * this way it survives tab navigation and is visible outside `/trening`
 * (spec §5).
 *
 * **The countdown is derived from `endsAt` (absolute timestamp), never by
 * decrementing a counter in `setInterval`.** A sleeping tab and a dark
 * screen pause `setInterval`, but not time; a per-tick decrement would lag
 * by the whole rest. The tick only recomputes the clock difference.
 */

/** How long the bar stays on screen after hitting zero (spec §5). */
const LINGER_MS = 5_000;
const TICK_MS = 250;

export interface RestTimerSnapshot {
  /** Countdown is running. */
  running: boolean;
  /** Reached zero; the bar is still visible with "Przerwa skończona". */
  finished: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  /** 1 → full rest ahead, 0 → the end. */
  progress: number;
  /** The exercise the timer started from — tapping the bar scrolls to its card. */
  workoutExerciseId: string | null;
}

const IDLE: RestTimerSnapshot = {
  running: false,
  finished: false,
  remainingSeconds: 0,
  totalSeconds: 0,
  progress: 0,
  workoutExerciseId: null,
};

interface TimerCore {
  endsAt: number;
  totalSeconds: number;
  workoutExerciseId: string | null;
  soundEnabled: boolean;
  finishedAt: number | null;
  warnedAtThree: boolean;
}

let core: TimerCore | null = null;
let snapshot: RestTimerSnapshot = IDLE;
let interval: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function publish(next: RestTimerSnapshot): void {
  const changed =
    next.running !== snapshot.running ||
    next.finished !== snapshot.finished ||
    next.remainingSeconds !== snapshot.remainingSeconds ||
    next.totalSeconds !== snapshot.totalSeconds ||
    next.workoutExerciseId !== snapshot.workoutExerciseId ||
    Math.abs(next.progress - snapshot.progress) > 0.001;
  if (!changed) {
    return;
  }
  snapshot = next;
  notify();
}

function stopInterval(): void {
  if (interval !== null) {
    clearInterval(interval);
    interval = null;
  }
}

function tick(): void {
  if (core === null) {
    publish(IDLE);
    stopInterval();
    return;
  }
  const now = Date.now();

  if (core.finishedAt !== null) {
    if (now - core.finishedAt >= LINGER_MS) {
      core = null;
      stopInterval();
      publish(IDLE);
      return;
    }
    publish({
      running: false,
      finished: true,
      remainingSeconds: 0,
      totalSeconds: core.totalSeconds,
      progress: 0,
      workoutExerciseId: core.workoutExerciseId,
    });
    return;
  }

  const remainingMs = core.endsAt - now;
  if (remainingMs <= 0) {
    core.finishedAt = now;
    vibrate([200, 100, 200]);
    if (core.soundEnabled) {
      playRestEndSound();
    }
    showRestEndNotification();
    tick();
    return;
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  if (remainingSeconds <= 3 && !core.warnedAtThree) {
    core.warnedAtThree = true;
    vibrate(80);
  }
  publish({
    running: true,
    finished: false,
    remainingSeconds,
    totalSeconds: core.totalSeconds,
    progress: Math.max(0, Math.min(1, remainingMs / (core.totalSeconds * 1000))),
    workoutExerciseId: core.workoutExerciseId,
  });
}

function ensureInterval(): void {
  if (interval !== null) {
    return;
  }
  interval = setInterval(tick, TICK_MS);
}

/** Confirming another set while a rest is running RESTARTS the timer. */
export function startRest(options: {
  seconds: number;
  workoutExerciseId: string | null;
  soundEnabled: boolean;
}): void {
  core = {
    endsAt: Date.now() + options.seconds * 1000,
    totalSeconds: options.seconds,
    workoutExerciseId: options.workoutExerciseId,
    soundEnabled: options.soundEnabled,
    finishedAt: null,
    warnedAtThree: false,
  };
  ensureInterval();
  tick();
  maybeRequestNotificationPermission();
}

/** `+30 s` accumulates without limit — the user knows better how much they need. */
export function addRestSeconds(seconds: number): void {
  if (core === null) {
    return;
  }
  if (core.finishedAt !== null) {
    core.finishedAt = null;
    core.endsAt = Date.now() + seconds * 1000;
    core.totalSeconds = seconds;
  } else {
    core.endsAt += seconds * 1000;
    core.totalSeconds += seconds;
  }
  core.warnedAtThree = false;
  tick();
}

export function skipRest(): void {
  core = null;
  stopInterval();
  publish(IDLE);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): RestTimerSnapshot {
  return snapshot;
}

function getServerSnapshot(): RestTimerSnapshot {
  return IDLE;
}

export function useRestTimer(): RestTimerSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The mere visibility of the bar — a primitive, so the rest of the app does not re-render every tick. */
export function useRestTimerVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.running || snapshot.finished,
    () => false,
  );
}

if (typeof document !== "undefined") {
  // Wake from sleep: setInterval was paused, but the clock was not. One
  // tick from the timestamp delta fixes the counter without any manual
  // adjustment.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tick();
    }
  });
}
