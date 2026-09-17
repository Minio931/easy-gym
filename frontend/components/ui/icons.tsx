import type { SVGProps } from "react";

/**
 * Ikony rysowane inline, 20 px, jeden styl kreski. Świadomie nie bierzemy
 * biblioteki ikon ani emoji (DESIGN.md §2) -- to kilkanaście ścieżek, a każda
 * zewnętrzna paczka dokłada wagi do apki uruchamianej na słabym LTE.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 19V11M9.5 19V5M15 19v-6M20.5 19V8" />
    </Icon>
  );
}

/** Sztanga -- zakładka „Trening". */
export function BarbellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />
    </Icon>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 9A9 9 0 1 1 3 12" />
      <path d="M3 4v5h5M12 7.5V12l3 2" />
    </Icon>
  );
}

/** Waga łazienkowa -- zakładka „Waga". */
export function ScaleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 9.5 12 13M8.5 7.2h7" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7.3l1.9 1.1M17.9 15.6l1.9 1.1M4.2 16.7l1.9-1.1M17.9 8.4l1.9-1.1" />
    </Icon>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 3.5h4a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-4" />
      <path d="M10 8.5 6.5 12 10 15.5M6.5 12H15" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12.5 10 17.5 19 7" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** Trzy kropki -- menu ćwiczenia i sesji (akcje rzadkie, u góry ekranu). */
export function MoreIcon(props: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Icon>
  );
}
