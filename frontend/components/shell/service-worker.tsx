"use client";

import { useEffect } from "react";

/**
 * Service worker registration. Renders nothing.
 *
 * **Production build only.** In `next dev` chunks have unstable names and
 * change on every file save; an SW holding them in cache may serve an old
 * chunk to new HTML and produce a white page that is "fixed" only by
 * manually clearing site data. That is the kind of bug that eats an hour
 * before anyone thinks of the service worker.
 *
 * Consequence: e2e tests (which run on `next dev`) verify the offline
 * layer at the Dexie level, not the SW. The offline shell is verified on
 * `npm run build && npm start` — see frontend/CLAUDE.md.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // No SW (private window, disabled in settings) takes away the
        // offline shell but not the app: data still lives in Dexie.
      });
    };

    // Registering after `load` does not compete for bandwidth with the first render.
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
