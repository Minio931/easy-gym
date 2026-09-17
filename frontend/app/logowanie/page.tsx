"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { messageForUser } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Jedyny ekran auth, jaki ta apka ma. Bez „Zarejestruj się" i bez „Nie
 * pamiętam hasła" -- dwóch znanych użytkowników, konta zakładane endpointem
 * admina z sekretem (PROMPT.md §0).
 */
export default function LoginPage() {
  const { status, signIn } = useAuth();
  const router = useRouter();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/pulpit");
    }
  }, [status, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(login.trim(), password);
      router.replace("/pulpit");
    } catch (caught) {
      setError(messageForUser(caught));
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center px-4 py-10">
      <p className="label-caps">easy-gym</p>
      <h1 className="num num-lg mt-2 text-ink">Zaloguj się</h1>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="login" className="label-caps mb-2 block">
            Login
          </label>
          <input
            id="login"
            name="login"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            className="h-control w-full rounded-control border border-hairline bg-surface-2 px-4 text-ink"
          />
        </div>

        <div>
          <label htmlFor="password" className="label-caps mb-2 block">
            Hasło
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-control w-full rounded-control border border-hairline bg-surface-2 px-4 text-ink"
          />
        </div>

        {error !== null && (
          <p
            role="alert"
            className="rounded-control px-3 py-2 text-sm"
            style={{ color: "var(--critical)", background: "rgba(208,59,59,.10)" }}
          >
            {error}
          </p>
        )}

        <Button type="submit" fullWidth disabled={isSubmitting || login === "" || password === ""}>
          {isSubmitting ? "Logowanie…" : "Zaloguj"}
        </Button>
      </form>

      <p className="meta mt-6">
        Konta zakłada administrator. Nie ma rejestracji ani resetu hasła.
      </p>
    </main>
  );
}
