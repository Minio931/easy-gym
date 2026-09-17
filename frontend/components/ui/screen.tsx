import type { ReactNode } from "react";

/**
 * Wrapper ekranu: margines boczny 16 px ustawiony RAZ tutaj, nie w każdym
 * komponencie, i max-width 560 px od 640 px w górę -- apka nie rozlewa się
 * na desktopie, bo i tak nie jest do niego (DESIGN.md §5).
 */
export function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[560px] px-4">{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="label-caps mb-3">{children}</h2>;
}

/** Pusty ekran: jedno zdanie co zrobić + akcja. Bez ilustracji i bez „Ups!". */
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

/** Szkielet zamiast spinnera -- ładowanie danych historycznych (DESIGN.md §7.7). */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-control bg-surface-2 ${className}`}
      aria-hidden="true"
    />
  );
}
