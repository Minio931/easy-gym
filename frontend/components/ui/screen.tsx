import type { ReactNode } from "react";

/**
 * Screen wrapper: 16 px side gutter set ONCE here, not in every component,
 * and max-width 560 px from 640 px up — the app does not spread out on
 * desktop, since it is not for desktop anyway (DESIGN.md §5).
 */
export function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[560px] px-4">{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="label-caps mb-3">{children}</h2>;
}

/** Empty screen: one sentence of what to do + action. No illustration, no "Oops!". */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-hairline bg-surface px-5 py-8 text-center">
      <p className="text-ink-2">{message}</p>
      {action !== undefined && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Skeleton instead of a spinner — loading historical data (DESIGN.md §7.7). */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-control bg-surface-2 ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Number tile: a large value, a label, an optional hint. Three such tiles
 * fit in a row at 390 px — and only three, which is why `truncate` is
 * everywhere here: a truncated label is tolerable, a truncated number
 * reads like a different number.
 */
export function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-card border border-hairline bg-surface px-1.5 py-3 text-center">
      <p className="num num-lg truncate">{value}</p>
      <p className="label-caps mt-1 truncate">{label}</p>
      {hint !== undefined && <p className="meta truncate">{hint}</p>}
    </div>
  );
}
