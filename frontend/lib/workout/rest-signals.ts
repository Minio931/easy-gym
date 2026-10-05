"use client";

/**
 * End-of-rest signals: sound, vibration, system notification.
 *
 * The sound is generated with WebAudio instead of loading a file — a few
 * lines instead of a request that would not go through offline anyway.
 * `AudioContext` must be unlocked by a user gesture (autoplay policy),
 * so we call {@link unlockAudio} on the first ✓ tap, not on screen entry.
 */

let audioContext: AudioContext | null = null;

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const scope = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? scope.webkitAudioContext ?? null;
}

export function unlockAudio(): void {
  const Constructor = audioContextConstructor();
  if (Constructor === null) {
    return;
  }
  audioContext ??= new Constructor();
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
}

/** Two short beeps — audible in a gym, but not a fire alarm. */
export function playRestEndSound(): void {
  if (audioContext === null || audioContext.state !== "running") {
    return;
  }
  const context = audioContext;
  const start = context.currentTime;
  for (const [index, frequency] of [880, 1174.7].entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * 0.18;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.18);
  }
}

export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

const PERMISSION_ASKED_KEY = "easy-gym.notifications-asked";

/**
 * We ask for permission once, after the first confirmed set — not on screen
 * entry. A context-free prompt is reflexively dismissed, and the browser
 * does not give a second chance.
 */
export function maybeRequestNotificationPermission(): void {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }
  if (Notification.permission !== "default") {
    return;
  }
  try {
    if (window.localStorage.getItem(PERMISSION_ASKED_KEY) !== null) {
      return;
    }
    window.localStorage.setItem(PERMISSION_ASKED_KEY, "1");
  } catch {
    return;
  }
  void Notification.requestPermission();
}

export function showRestEndNotification(): void {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }
  if (Notification.permission !== "granted" || document.visibilityState === "visible") {
    return;
  }
  try {
    new Notification("Przerwa skończona", { body: "Czas na kolejną serię.", tag: "easy-gym-rest" });
  } catch {
    /* some browsers require a Service Worker — then vibration is the fallback */
  }
}
