"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom-slide sheet (200 ms, DESIGN §8). On the workout screen it is
 * deliberately rare: no action performed during a set opens a modal.
 * Three places remain — exercise picker, (⋮) menu and finish confirmation.
 *
 * Rendered via PORTAL to `<body>`, and the app content gets `inert` +
 * `aria-hidden` for the duration. Without this a screen reader and Tab
 * reach under the sheet, and "Zakończ" in the sheet and "Zakończ trening"
 * underneath are simultaneously reachable — a modal that hides nothing.
 */
const APP_ROOT_ID = "app-root";

/** Nested sheets (session menu → finish) must not drop `inert` too early. */
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
  /** `full` = full screen (exercise picker), `bottom` = bottom sheet. */
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
