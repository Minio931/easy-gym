"use client";

import { useEffect } from "react";

/**
 * Rejestracja service workera. Nic nie renderuje.
 *
 * **Tylko w buildzie produkcyjnym.** W `next dev` chunki nie mają stabilnych
 * nazw i zmieniają się przy każdym zapisie pliku; SW trzymający je w cache
 * potrafi podać stary chunk do nowego HTML-a i wywołać białą stronę, którą
 * „naprawia" dopiero ręczne czyszczenie danych witryny. To jest ten rodzaj
 * błędu, który zjada godzinę, zanim ktokolwiek pomyśli o service workerze.
 *
 * Konsekwencja: testy e2e (chodzą po `next dev`) sprawdzają warstwę offline
 * na poziomie Dexie, nie SW. Powłokę offline weryfikuje się na `npm run build
 * && npm start` — patrz frontend/CLAUDE.md.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Brak SW (prywatne okno, wyłączony w ustawieniach) odbiera offline
        // powłokę, ale nie apkę: dane i tak żyją w Dexie.
      });
    };

    // Rejestracja po `load` nie konkuruje o pasmo z pierwszym renderem.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => {
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
