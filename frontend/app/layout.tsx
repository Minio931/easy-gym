import type { Metadata, Viewport } from "next";
import { Archivo, Public_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/components/shell/service-worker";
import { AuthProvider } from "@/lib/auth/auth-context";
import "./globals.css";

/**
 * Both faces with full Polish diacritics (latin-ext subset). Archivo is a
 * variable font with the `wdth` axis — narrowed, stamp-like numbers are
 * this app's signature (DESIGN.md §4) and without that axis the .num-*
 * classes have nothing to drive them.
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
  // iOS does not read the PWA manifest — it takes the home-screen icon from here.
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Phone in a case, notched screen — content must extend under safe-area,
  // and the bars push themselves away from it (DESIGN.md §5).
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
        {/* The manual theme choice must apply BEFORE the first paint —
            otherwise a user on the light theme sees a flash of black on
            every entry. The script is intentionally tiny and synchronous. */}
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
