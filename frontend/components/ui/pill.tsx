"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

/**
 * Marker/filter pill. 44 px high — this is a touch target during a set,
 * not a header ornament. The "on" state is carried by fill AND
 * `aria-pressed`, never by color alone (DESIGN §9).
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
