"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Screen, SectionLabel } from "@/components/ui/screen";
import { LogoutIcon } from "@/components/ui/icons";
import { useAuth } from "@/lib/auth/auth-context";
import { useSettings, type ThemePreference } from "@/lib/settings";
import { estimate1RM, type OneRepMaxFormula } from "@/lib/metrics";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Systemowy" },
  { value: "dark", label: "Ciemny" },
  { value: "light", label: "Jasny" },
];

const FORMULAS: { value: OneRepMaxFormula; label: string }[] = [
  { value: "epley", label: "Epley" },
  { value: "brzycki", label: "Brzycki" },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-hairline py-4 last:border-b-0">
      <p className="label-caps mb-3">{label}</p>
      {children}
    </div>
  );
}

/** Rząd pigułek -- ten sam wzorzec co przełącznik zakresu na wykresach. */
function PillGroup<T extends string>({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-2">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`h-touch flex-1 rounded-full px-4 text-sm font-semibold transition-colors duration-[120ms] ${
              isActive
                ? "bg-accent text-accent-ink"
                : "border border-hairline bg-surface-2 text-ink-2"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { settings, update } = useSettings();
  const router = useRouter();

  // Podgląd na żywo: 100 kg × 5 w wybranej formule. Formuła nigdy nie jest
  // zapisywana przy danych -- e1RM liczy się na żywo, więc jej zmiana
  // przelicza całą historię, zamiast ją zafałszować.
  const preview = estimate1RM(100, 5, settings.oneRepMaxFormula);

  return (
    <Screen>
      <SectionLabel>Konto</SectionLabel>
      <div className="rounded-card border border-hairline bg-surface px-4">
        <Row label="Zalogowany jako">
          <p className="num num-md text-ink">{user?.login ?? "—"}</p>
        </Row>
        <Row label="Motyw">
          <PillGroup
            name="Motyw"
            options={THEMES}
            value={settings.theme}
            onChange={(theme) => update({ theme })}
          />
        </Row>
        <Row label="Wzór e1RM">
          <PillGroup
            name="Wzór e1RM"
            options={FORMULAS}
            value={settings.oneRepMaxFormula}
            onChange={(oneRepMaxFormula) => update({ oneRepMaxFormula })}
          />
          <p className="meta mt-3">
            100 kg × 5 powt. ={" "}
            <span className="num text-ink-2">{preview === null ? "—" : `${preview} kg`}</span>.
            Wzór działa wstecz na całą historię — nic nie jest zapisywane w bazie.
          </p>
        </Row>
      </div>

      <div className="mt-6">
        <Button
          variant="secondary"
          fullWidth
          onClick={async () => {
            await signOut();
            router.replace("/logowanie");
          }}
        >
          <LogoutIcon />
          Wyloguj
        </Button>
      </div>

      <p className="meta mt-6">
        Eksport XLSX dojdzie tutaj w etapie 9.
      </p>
    </Screen>
  );
}
