"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Skeleton } from "@/components/ui/screen";

/**
 * Guard tras. Świadomie tylko po stronie klienta: tokeny żyją w
 * localStorage (PWA offline-first), więc serwer Next.js i tak nie wie, kto
 * pyta -- a realną bramką jest backend, który odrzuca każde żądanie bez
 * ważnego JWT. Ten komponent pilnuje wyłącznie tego, żeby nie migał pusty
 * ekran apki przed przekierowaniem na logowanie.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/logowanie");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-[560px] space-y-3 px-4 py-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
