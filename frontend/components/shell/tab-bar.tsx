"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import {
  BarbellIcon,
  DashboardIcon,
  HistoryIcon,
  ScaleIcon,
} from "@/components/ui/icons";

interface Tab {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Cztery zakładki, polskie etykiety. Ustawienia i eksport wchodzą przez
 * górny pasek, nie jako piąta zakładka (DESIGN.md §11). */
const TABS: Tab[] = [
  { href: "/pulpit", label: "Pulpit", Icon: DashboardIcon },
  { href: "/trening", label: "Trening", Icon: BarbellIcon },
  { href: "/historia", label: "Historia", Icon: HistoryIcon },
  { href: "/waga", label: "Waga", Icon: ScaleIcon },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="tab-bar left-0 right-0 z-20 border-t border-hairline bg-surface"
      aria-label="Nawigacja główna"
    >
      <ul className="mx-auto flex h-tabbar w-full max-w-[560px]">
        {TABS.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-tabbar w-full flex-col items-center justify-center gap-1 ${
                  isActive ? "text-accent" : "text-ink-3"
                }`}
              >
                <Icon width={22} height={22} />
                <span className="text-[11px] leading-none font-semibold">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
