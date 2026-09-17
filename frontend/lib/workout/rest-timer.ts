"use client";

import { useSyncExternalStore } from "react";
import {
  maybeRequestNotificationPermission,
  playRestEndSound,
  showRestEndNotification,
  vibrate,
} from "@/lib/workout/rest-signals";

/**
 * Timer przerwy. Żyje w module, nie w komponencie karty ćwiczenia — dzięki
 * temu przetrwa nawigację między zakładkami i jest widoczny również poza
 * `/trening` (spec §5).
 *
 * **Odliczanie liczy się z `endsAt` (timestamp absolutny), nigdy przez
 * dekrementację licznika w `setInterval`.** Uśpiona zakładka i wygaszony ekran
 * zatrzymują `setInterval`, ale nie zatrzymują czasu; licznik dekrementowany
 * co tick spóźniłby się o całą przerwę. Tick tylko przelicza różnicę zegarów.
 */

/** Ile pasek zostaje na ekranie po dojściu do zera (spec §5). */
const LINGER_MS = 5_000;
const TICK_MS = 250;

export interface RestTimerSnapshot {
  /** Odliczanie trwa. */
  running: boolean;
  /** Doszło do zera; pasek jeszcze widać z napisem „Przerwa skończona". */
  finished: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  /** 1 → pełna przerwa przed nami, 0 → koniec. */
  progress: number;
  /** Ćwiczenie, od którego timer ruszył — tap w pasek przewija do jego karty. */
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

/** Zatwierdzenie kolejnej serii w trakcie trwania przerwy RESTARTUJE timer. */
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

/** `+30 s` kumuluje się bez limitu — user wie lepiej, ile potrzebuje. */
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

/** Sam fakt widoczności paska — primitive, więc reszta apki nie re-renderuje się co tick. */
export function useRestTimerVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.running || snapshot.finished,
    () => false,
  );
}

if (typeof document !== "undefined") {
  // Powrót z uśpienia: setInterval był wstrzymany, ale zegar nie. Jeden tick
  // z różnicy timestampów naprawia licznik bez żadnej korekty „na piechotę".
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tick();
    }
  });
}
