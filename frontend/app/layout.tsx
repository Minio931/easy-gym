import type { Metadata, Viewport } from "next";
import { Archivo, Public_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/components/shell/service-worker";
import { AuthProvider } from "@/lib/auth/auth-context";
import "./globals.css";

/**
 * Oba kroje z pełną diakrytyką PL (subset latin-ext). Archivo bierzemy jako
 * font zmienny z osią `wdth` -- zwężone, stemplowane liczby to sygnatura tej
 * apki (DESIGN.md §4) i bez tej osi klasy .num-* nie mają czym zadziałać.
 */
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "easy-gym",
  description: "Trening siłowy i masa ciała — bez ściemy i bez zasięgu.",
  applicationName: "easy-gym",
  appleWebApp: { capable: true, title: "easy-gym", statusBarStyle: "black-translucent" },
  // iOS nie czyta manifestu PWA -- ikonę ekranu głównego bierze stąd.
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Telefon w etui, ekran z wycięciem -- treść musi wchodzić pod safe-area,
  // a paski same się od niej odsuwają (DESIGN.md §5).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E0F11" },
    { media: "(prefers-color-scheme: light)", color: "#FAFAF8" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl" className={`${archivo.variable} ${publicSans.variable}`}>
      <head>
        {/* Ręczny wybór motywu musi zadziałać PRZED pierwszym malowaniem --
            inaczej użytkownik z jasnym motywem dostaje mignięcie czerni przy
            każdym wejściu. Skrypt jest celowo mikroskopijny i synchroniczny. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=JSON.parse(localStorage.getItem('easy-gym.settings')||'{}').theme;" +
              "if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}",
          }}
        />
      </head>
      <body className="antialiased">
        <ServiceWorkerRegistration />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
