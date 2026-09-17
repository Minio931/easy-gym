"use client";

import { useSyncExternalStore } from "react";
import type { OneRepMaxFormula } from "@/lib/metrics";

/**
 * Ustawienia użytkownika trzymane lokalnie. Świadomie NIE w bazie: backend
 * nie ma jeszcze endpointu profilu, a obie te wartości są per-urządzenie
 * (motyw) albo bez wpływu na dane (formuła e1RM liczy się na żywo, nigdy nie
 * jest zapisywana -- PROMPT.md §4). Gdy dojdzie endpoint profilu, formuła
 * przeniesie się na serwer; motyw zostanie tutaj.
 */

export type ThemePreference = "system" | "dark" | "light";

export interface Settings {
  theme: ThemePreference;
  oneRepMaxFormula: OneRepMaxFormula;
  /** Domyślna przerwa między seriami w sekundach (konfigurowalna per ćwiczenie w etapie 4). */
  defaultRestSeconds: number;
}

const STORAGE_KEY = "easy-gym.settings";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  oneRepMaxFormula: "epley",
  defaultRestSeconds: 120,
};

function parse(raw: string | null): Settings {
  if (raw === null) {
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      theme:
        parsed.theme === "dark" || parsed.theme === "light" || parsed.theme === "system"
          ? parsed.theme
          : DEFAULT_SETTINGS.theme,
      oneRepMaxFormula:
        parsed.oneRepMaxFormula === "brzycki" || parsed.oneRepMaxFormula === "epley"
          ? parsed.oneRepMaxFormula
          : DEFAULT_SETTINGS.oneRepMaxFormula,
      defaultRestSeconds:
        typeof parsed.defaultRestSeconds === "number" && parsed.defaultRestSeconds > 0
          ? parsed.defaultRestSeconds
          : DEFAULT_SETTINGS.defaultRestSeconds,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const listeners = new Set<() => void>();

/** `undefined` = jeszcze nie czytaliśmy localStorage. Cache jest wymagany:
 * useSyncExternalStore pętli się, jeśli migawka zwraca za każdym razem nowy
 * obiekt. */
let cached: Settings | undefined = undefined;

export function readSettings(): Settings {
  if (cached === undefined) {
    cached = typeof window === "undefined"
      ? DEFAULT_SETTINGS
      : parse(window.localStorage.getItem(STORAGE_KEY));
  }
  return cached;
}

function readServerSettings(): Settings {
  return DEFAULT_SETTINGS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updateSettings(patch: Partial<Settings>): void {
  cached = { ...readSettings(), ...patch };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  if (patch.theme !== undefined) {
    applyTheme(patch.theme);
  }
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Ręczny wybór motywu musi wygrywać w OBIE strony, także nad
 * prefers-color-scheme -- stąd atrybut data-theme na <html>, obsłużony w
 * globals.css osobnym blokiem, nie tylko media query. Przy starcie robi to
 * mikroskopijny skrypt w app/layout.tsx (żeby nie było mignięcia), tutaj
 * tylko przy zmianie ustawienia.
 */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function useSettings(): { settings: Settings; update: (patch: Partial<Settings>) => void } {
  const settings = useSyncExternalStore(subscribe, readSettings, readServerSettings);
  return { settings, update: updateSettings };
}
