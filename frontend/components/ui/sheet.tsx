"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Arkusz wjeżdżający z dołu (200 ms, DESIGN §8). Na ekranie treningu jest
 * świadomie rzadki: żadna akcja wykonywana w trakcie serii nie otwiera modala.
 * Zostają trzy miejsca — wybór ćwiczenia, menu (⋮) i potwierdzenie zakończenia.
 *
 * Renderuje się PORTALEM do `<body>`, a treść aplikacji dostaje na ten czas
 * `inert` + `aria-hidden`. Bez tego czytnik ekranu i Tab wchodzą pod arkusz,
 * a „Zakończ" w arkuszu i „Zakończ trening" pod spodem są jednocześnie
 * osiągalne — czyli modal, który niczego nie zasłania.
 */
const APP_ROOT_ID = "app-root";

/** Zagnieżdżone arkusze (menu sesji → zakończenie) nie mogą zdjąć `inert` za wcześnie. */
let openSheets = 0;

export function Sheet({
  title,
  onClose,
  children,
  variant = "bottom",
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `full` = pełny ekran (wyszukiwarka ćwiczeń), `bottom` = arkusz przy dole. */
  variant?: "full" | "bottom";
  footer?: ReactNode;
}) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const root = document.getElementById(APP_ROOT_ID);
    openSheets += 1;
    if (root !== null) {
      root.setAttribute("inert", "");
      root.setAttribute("aria-hidden", "true");
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openSheets -= 1;
      if (openSheets === 0 && root !== null) {
        root.removeAttribute("inert");
        root.removeAttribute("aria-hidden");
      }
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Zamknij"
        onClick={onClose}
        className="absolute inset-0 bg-bg/70"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "slide-up-in relative flex flex-col border-t border-hairline bg-bg",
          variant === "full" ? "h-full" : "max-h-[85dvh] rounded-t-[14px]",
        ].join(" ")}
      >
        {children}
        {footer !== undefined && (
          <div className="border-t border-hairline px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
