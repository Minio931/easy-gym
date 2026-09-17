import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  children: ReactNode;
}

/**
 * Wysokość 48 px (--spacing-control) to nie jest wybór estetyczny -- to
 * minimalny cel dotykowy dla akcji wykonywanej w trakcie serii, spoconym
 * kciukiem (DESIGN.md §6).
 */
const VARIANTS: Record<Variant, string> = {
  primary: "bg-cta text-cta-ink active:opacity-90",
  secondary: "bg-surface-2 text-ink border border-hairline active:bg-surface-3",
  ghost: "text-ink-2 active:bg-surface-2",
  danger: "bg-surface-2 text-[var(--critical)] border border-hairline active:bg-surface-3",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "h-control rounded-control px-5 text-base font-semibold",
        "inline-flex items-center justify-center gap-2",
        "transition-[opacity,background-color] duration-[120ms] ease-out",
        "disabled:opacity-45",
        fullWidth ? "w-full" : "",
        VARIANTS[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
