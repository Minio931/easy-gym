"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SyncPill } from "@/components/shell/sync-pill";
import { SettingsIcon } from "@/components/ui/icons";

/**
 * Górny pasek: tytuł, slot na dodatki ekranu (na `/trening` czas sesji i menu
 * sesji), pigułka stanu synchronizacji i wejście w ustawienia.
 *
 * Wszystko po prawej to akcje RZADKIE — w trakcie serii nikt tu nie sięga,
 * więc mogą być małe i daleko od kciuka (spec §1, podział kciukowy).
 */
export function AppBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="app-bar z-20 border-b border-hairline bg-bg">
      <div className="mx-auto flex h-appbar w-full max-w-[560px] items-center gap-2 px-4">
        <h1 className="screen-title shrink-0 truncate">{title}</h1>
        {children}
        <span className="flex-1" />
        <SyncPill />
        <Link
          href="/ustawienia"
          className="-mr-2.5 flex size-touch shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
        >
          <SettingsIcon />
          <span className="sr-only">Ustawienia</span>
        </Link>
      </div>
    </header>
  );
}
