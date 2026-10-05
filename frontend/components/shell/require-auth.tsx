"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Skeleton } from "@/components/ui/screen";

/**
 * Route guard. Deliberately client-side only: tokens live in localStorage
 * (PWA offline-first), so the Next.js server does not know who is asking
 * anyway — and the real gate is the backend, which rejects every request
 * without a valid JWT. This component only prevents a flash of empty app
 * UI before the redirect to login.
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
