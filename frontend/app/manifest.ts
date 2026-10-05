import type { MetadataRoute } from "next";

/**
 * PWA manifest. Next generates `/manifest.webmanifest` from this and
 * injects `<link rel="manifest">` on its own — a hand-written file in
 * `public/` would be a second copy of the truth.
 *
 * `start_url` points to `/pulpit`, not `/`: an app launched from the icon
 * should land on the dashboard, and `/` is a mere redirect that would
 * flash on every launch. The route guard will still send users to
 * `/logowanie` when there is no session.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "easy-gym — trening i waga",
    short_name: "easy-gym",
    description:
      "Zapis treningu siłowego i masy ciała. Działa bez zasięgu i synchronizuje się po odzyskaniu sieci.",
    lang: "pl",
    dir: "ltr",
    start_url: "/pulpit",
    scope: "/",
    // `standalone` removes the address bar — in the gym every vertical
    // pixel counts, and the app has nowhere to navigate outside itself anyway.
    display: "standalone",
    orientation: "portrait",
    // Dark-theme colors: the Android splash screen and status bar do not
    // read CSS, so they take values from here. Dark is the default per
    // DESIGN.md.
    background_color: "#0E0F11",
    theme_color: "#0E0F11",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
