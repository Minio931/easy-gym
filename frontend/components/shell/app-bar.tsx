"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SyncPill } from "@/components/shell/sync-pill";
import { SettingsIcon } from "@/components/ui/icons";

/**
 * Top bar: title, slot for screen extras (on `/trening` the session time
 * and session menu), sync-status pill and entry to settings.
 *
 * Everything on the right is RARE actions — nobody reaches here mid-set,
 * so they can be small and far from the thumb (spec §1, thumb zoning).
 */
export function AppBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="app-bar z-20 border-b border-hairline bg-bg">
      <div className="mx-auto flex h-appbar w-full max-w-[560px] items-center gap-2 px-4">
        {/* `min-w-0 shrink` (not `shrink-0`), otherwise `truncate` has
            nothing to shorten: an element that cannot narrow never clips
            text. At 320 px with the sync pill on screen the bar overflowed
            the window width and the whole page got horizontal scroll. The
            title is the most redundant information here — the bottom nav
            already shows which screen we are on — so it yields first. */}
        <h1 className="screen-title min-w-0 shrink truncate">{title}</h1>
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
