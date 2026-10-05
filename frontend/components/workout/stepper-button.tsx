"use client";

import { useEffect, useRef } from "react";

/**
 * Stepper button (`−2.5` / `+2.5` / `−1` / `+1`), 56 × 48 px.
 *
 * Press-and-hold starts autorepeat (begins after 400 ms, then every
 * 100 ms) — going from 60 to 140 kg is otherwise 32 taps. The value is
 * clamped to range in `lib/workout/set-values.ts`, so holding plus never
 * sends the field past 500 kg.
 */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 100;

export function StepperButton({
  label,
  unit,
  onStep,
}: {
  label: string;
  /** Screen-reader hint: "+2.5" on its own does not say what it applies to. */
  unit: string;
  onStep: () => void;
}) {
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerHandledRef = useRef(false);
  const onStepRef = useRef(onStep);

  // Autorepeat calls the FRESHEST callback: the step is computed from the
  // current field value, so a closure-frozen version would keep adding
  // the same amount.
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
        // Click without pointerdown = keyboard. With pointer the step already fired.
        if (pointerHandledRef.current) {
          pointerHandledRef.current = false;
          return;
        }
        onStepRef.current();
      }}
    >
      {/* The accessible name starts with the VISIBLE text — an aria-label
          that replaces it diverges what the user sees from what they hear. */}
      {label}
      <span className="sr-only"> {unit}</span>
    </button>
  );
}
