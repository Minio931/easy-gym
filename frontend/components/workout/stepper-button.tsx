"use client";

import { useEffect, useRef } from "react";

/**
 * Przycisk steppera (`−2.5` / `+2.5` / `−1` / `+1`), 56 × 48 px.
 *
 * Przytrzymanie uruchamia autorepeat (start po 400 ms, potem co 100 ms) —
 * dojście z 60 do 140 kg to inaczej 32 tapnięcia. Wartość jest zaciskana do
 * zakresu po stronie `lib/workout/set-values.ts`, więc trzymanie plusa nigdy
 * nie wyprowadzi pola poza 500 kg.
 */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 100;

export function StepperButton({
  label,
  unit,
  onStep,
}: {
  label: string;
  /** Dopowiedzenie dla czytnika ekranu: „+2.5" samo w sobie nie mówi, czego dotyczy. */
  unit: string;
  onStep: () => void;
}) {
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerHandledRef = useRef(false);
  const onStepRef = useRef(onStep);

  // Autorepeat woła NAJŚWIEŻSZY callback: krok liczy się od aktualnej wartości
  // pola, więc zamrożona domknięciem wersja dodawałaby wciąż to samo.
  useEffect(() => {
    onStepRef.current = onStep;
  });

  const stop = () => {
    if (delayRef.current !== null) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (repeatRef.current !== null) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  };

  useEffect(() => stop, []);

  return (
    <button
      type="button"
      className="h-control w-14 shrink-0 rounded-control border border-hairline bg-surface-2 text-[15px] font-semibold text-ink tabular-nums active:bg-surface-3"
      onPointerDown={() => {
        pointerHandledRef.current = true;
        onStepRef.current();
        delayRef.current = setTimeout(() => {
          repeatRef.current = setInterval(() => {
            onStepRef.current();
          }, REPEAT_INTERVAL_MS);
        }, REPEAT_DELAY_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        // Klik bez pointerdown = klawiatura. Z pointerem krok już poleciał.
        if (pointerHandledRef.current) {
          pointerHandledRef.current = false;
          return;
        }
        onStepRef.current();
      }}
    >
      {/* Nazwa dostępna zaczyna się od WIDOCZNEGO tekstu — aria-label, który go
          zastępuje, rozjeżdża to, co user widzi, z tym, co słyszy. */}
      {label}
      <span className="sr-only"> {unit}</span>
    </button>
  );
}
