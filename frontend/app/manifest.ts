import type { MetadataRoute } from "next";

/**
 * Manifest PWA. Next generuje z tego `/manifest.webmanifest` i sam wstawia
 * `<link rel="manifest">` — własny plik w `public/` byłby drugą kopią prawdy.
 *
 * `start_url` celowo wskazuje `/pulpit`, nie `/`: apka uruchomiona z ikony ma
 * pokazać pulpit, a `/` jest wyłącznie przekierowaniem i migałoby przy każdym
 * starcie. Guard tras i tak przeniesie na `/logowanie`, gdy nie ma sesji.
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
    // `standalone` zdejmuje pasek adresu -- na siłowni liczy się każdy
    // pionowy piksel, a apka i tak nie ma dokąd nawigować poza siebie.
    display: "standalone",
    orientation: "portrait",
    // Kolory motywu ciemnego: ekran startowy Androida i pasek stanu nie
    // czytają CSS, więc biorą wartości stąd. Ciemny jest domyślny w DESIGN.md.
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
