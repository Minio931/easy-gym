"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppBar } from "@/components/shell/app-bar";
import { TabBar } from "@/components/shell/tab-bar";
import { ActiveWorkoutBar } from "@/components/workout/active-workout-bar";
import { RestTimerBar } from "@/components/workout/rest-timer-bar";
import { UndoToast } from "@/components/workout/undo-toast";
import { WorkoutAppBarExtras } from "@/components/workout/workout-app-bar-extras";
import { useSettings } from "@/lib/settings";
import { useRestTimerVisible } from "@/lib/workout/rest-timer";
import { ensureActiveWorkoutLoaded, useHasActiveWorkout } from "@/lib/workout/store";

const TITLES: Record<string, string> = {
  "/pulpit": "Pulpit",
  "/trening": "Trening",
  "/historia": "Historia",
  "/waga": "Waga ciała",
  "/szablony": "Szablony",
  "/ustawienia": "Ustawienia",
};

/** Wysokości pasków doklejanych nad dolną nawigacją (DESIGN §7.3, §11). */
const REST_BAR_PX = 64;
const ACTIVE_WORKOUT_BAR_PX = 44;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { settings } = useSettings();
  const timerVisible = useRestTimerVisible();
  const hasWorkout = useHasActiveWorkout();

  // Trening ładujemy raz, na poziomie powłoki: pasek „Trening trwa" i timer
  // przerwy są widoczne z każdej zakładki, nie tylko z /trening.
  useEffect(() => {
    ensureActiveWorkoutLoaded(settings.oneRepMaxFormula);
  }, [settings.oneRepMaxFormula]);

  const isWorkout = pathname === "/trening";
  // Nazwa ćwiczenia jest długa i zmienna, więc w pasku zostaje rodzaj ekranu,
  // a nazwa jest nagłówkiem treści — tak samo jak przy podsumowaniu.
  const title = pathname.startsWith("/trening/")
    ? "Podsumowanie"
    : pathname.startsWith("/cwiczenie/")
      ? "Ćwiczenie"
      : pathname.startsWith("/szablony/")
        ? "Szablon"
        : (TITLES[pathname] ?? "easy-gym");
  const showActiveWorkoutBar = hasWorkout && !isWorkout;

  const extraBottomPx =
    (timerVisible ? REST_BAR_PX : 0) + (showActiveWorkoutBar ? ACTIVE_WORKOUT_BAR_PX : 0);

  return (
    <div className="min-h-dvh" id="app-root">
      <AppBar title={title}>{isWorkout && <WorkoutAppBarExtras />}</AppBar>
      {/* Odstęp dolny rośnie i maleje z ANIMACJĄ — wjazd timera nie może
          podskoczyć listą serii pod palcem (spec §1). */}
      <main
        className="pt-5 transition-[padding-bottom] duration-200 ease-out"
        style={{
          paddingBottom: `calc(var(--spacing-tabbar) + env(safe-area-inset-bottom, 0px) + 16px + ${extraBottomPx}px)`,
        }}
      >
        {children}
      </main>
      <UndoToast />
      <RestTimerBar />
      {showActiveWorkoutBar && <ActiveWorkoutBar />}
      <TabBar />
    </div>
  );
}
