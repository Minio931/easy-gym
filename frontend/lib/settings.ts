"use client";

import { useSyncExternalStore } from "react";
import type { OneRepMaxFormula } from "@/lib/metrics";

/**
 * User settings kept locally. Deliberately NOT in the database: the backend
 * has no profile endpoint yet, and both values are either per-device (theme)
 * or do not affect data (the e1RM formula is computed on the fly and never
 * persisted — PROMPT.md §4). When a profile endpoint lands, the formula
 * moves to the server; the theme stays here.
 */

export type ThemePreference = "system" | "dark" | "light";

export interface Settings {
  theme: ThemePreference;
  oneRepMaxFormula: OneRepMaxFormula;
  /** Default rest between sets, in seconds (per-exercise configurable in stage 4). */
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

/** `undefined` = we have not read localStorage yet. The cache is required:
 * useSyncExternalStore loops if the snapshot returns a new object every
 * time. */
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
 * A manual theme choice must win in BOTH directions, including over
 * prefers-color-scheme — hence the data-theme attribute on <html>, handled
 * in globals.css by a dedicated block, not only a media query. At startup
 * that is done by a tiny script in app/layout.tsx (to avoid a flash); here
 * only on a setting change.
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
