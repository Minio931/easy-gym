"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

/**
 * Pigułka znacznika/filtra. 44 px wysokości — to jest cel dotykowy w trakcie
 * serii, nie ozdoba nagłówka. Stan „włączona" niesie wypełnienie ORAZ
 * `aria-pressed`, nigdy sam kolor (DESIGN §9).
 */
export function Pill({ active = false, className = "", children, ...props }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={[
        "h-touch shrink-0 rounded-full px-4 text-[13px] font-semibold whitespace-nowrap",
        "inline-flex items-center gap-1.5 border transition-colors duration-[120ms] ease-out",
        active
          ? "border-hairline bg-surface-3 text-ink"
          : "border-hairline bg-transparent text-ink-3",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
