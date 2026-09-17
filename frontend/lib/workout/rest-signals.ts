"use client";

/**
 * Sygnały końca przerwy: dźwięk, wibracja, powiadomienie systemowe.
 *
 * Dźwięk generujemy WebAudio zamiast ładować plik — kilka linijek zamiast
 * requestu, który i tak nie przejdzie offline. `AudioContext` musi zostać
 * odblokowany gestem użytkownika (polityka autoplay), więc wołamy
 * {@link unlockAudio} przy pierwszym tapnięciu ✓, a nie przy wejściu na ekran.
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

/** Dwa krótkie sygnały — słyszalne w hali, a nie alarm pożarowy. */
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
 * O zgodę pytamy raz, po pierwszej zatwierdzonej serii — nie przy wejściu na
 * ekran. Prośba bez kontekstu jest odruchowo odrzucana, a drugiej szansy
 * przeglądarka nie daje.
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
    /* niektóre przeglądarki wymagają Service Workera — wtedy zostaje wibracja */
  }
}
