"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/pill";
import { StepperButton } from "@/components/workout/stepper-button";
import type { SetDraft } from "@/lib/workout/draft";
import { referenceSet, referenceText } from "@/lib/workout/reference";
import {
  REPS_STEP,
  WEIGHT_STEP,
  parseDecimalInput,
  roundToGrain,
  stepReps,
  stepWeight,
  validateSetInput,
} from "@/lib/workout/set-values";
import type { ExerciseReference } from "@/lib/workout/store";

const RPE_CHIPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Aktywny (edytowany) wiersz serii — jedyny taki na ekranie. Rozwija się w
 * tacę: inputy, steppery, znaczniki. Wszystko, co się tu klika, leży w dolnych
 * dwóch trzecich ekranu, bo to są akcje wykonywane w trakcie serii.
 *
 * Inputy trzymają SUROWY tekst, nie liczbę: „102," w trakcie pisania to
 * poprawny stan przejściowy, a pusty input to brak wartości, nie zero.
 * Zaokrąglenie do 0.25 kg następuje przy opuszczeniu pola, nie przy każdym
 * naciśnięciu klawisza (inaczej nie da się wpisać „102.75").
 */
export function ActiveSetRow({
  draft,
  index,
  reference,
  onChange,
  onConfirm,
  onDelete,
}: {
  draft: SetDraft;
  index: number;
  reference: ExerciseReference | undefined;
  onChange: (patch: Partial<SetDraft>) => void;
  onConfirm: () => void;
  onDelete: (() => void) | null;
}) {
  const [rpeOpen, setRpeOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // Aktywny wiersz musi być widoczny NAD timerem, nie pod nim (spec §1).
  useEffect(() => {
    rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [draft.id]);

  const validation = validateSetInput(draft.weight, draft.reps, draft.rpe);
  const previous = referenceSet(reference, index);
  const canConfirm = validation.values !== null;
  const showMessage =
    validation.message !== null && (!validation.incomplete || draft.submitAttempted);

  const weightId = `weight-${draft.id}`;
  const repsId = `reps-${draft.id}`;
  const errorId = `error-${draft.id}`;

  return (
    <div ref={rowRef} className="py-2">
      <div className="flex items-center gap-3">
        <span className="w-6 shrink-0 text-center">
          {draft.isWarmup ? (
            <span className="inline-block rounded-full bg-surface-3 px-[7px] py-0.5 text-[12px] leading-4 font-semibold text-ink-2">
              R
            </span>
          ) : (
            <span className="meta">{index + 1}</span>
          )}
        </span>

        <div
          className="flex min-w-0 flex-1 items-baseline gap-1 rounded-control border-2 border-accent bg-surface-2 px-2 py-1.5 min-[360px]:gap-2 min-[360px]:px-3"
          style={{ containerType: "inline-size" }}
        >
          <label htmlFor={weightId} className="sr-only">
            Ciężar w kilogramach, seria {index + 1}
          </label>
          <input
            id={weightId}
            className="num num-input flex-1"
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            aria-describedby={validation.weightError !== null ? errorId : undefined}
            aria-invalid={validation.weightError !== null}
            placeholder={previous === null ? "0" : String(previous.weightKg)}
            value={draft.weight}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            onChange={(event) => {
              onChange({ weight: event.target.value });
            }}
            onBlur={() => {
              const parsed = parseDecimalInput(draft.weight);
              if (parsed !== null) {
                onChange({ weight: String(roundToGrain(parsed)) });
              }
            }}
          />
          <span className="meta shrink-0">kg</span>
          <span className="shrink-0 text-[16px] text-ink-3" aria-hidden="true">
            ×
          </span>
          <label htmlFor={repsId} className="sr-only">
            Powtórzenia, seria {index + 1}
          </label>
          <input
            id={repsId}
            className="num num-input w-[2.6ch] shrink-0"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            aria-describedby={validation.repsError !== null ? errorId : undefined}
            aria-invalid={validation.repsError !== null}
            placeholder={previous === null ? "0" : String(previous.reps)}
            value={draft.reps}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            onChange={(event) => {
              onChange({ reps: event.target.value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
                onConfirm();
              }
            }}
          />
          <span className="meta shrink-0">powt.</span>
        </div>

        <button
          type="button"
          onClick={onConfirm}
          aria-disabled={!canConfirm}
          aria-describedby={showMessage ? errorId : undefined}
          className={[
            "grid size-control shrink-0 place-items-center rounded-control border",
            canConfirm
              ? "border-transparent bg-cta text-cta-ink"
              : "border-hairline text-ink-3 opacity-60",
          ].join(" ")}
        >
          <CheckIcon strokeWidth={2.2} />
          <span className="sr-only">Zatwierdź serię {index + 1}</span>
        </button>
      </div>

      {/* Wcięcie 36 px (równo z inputami) znika poniżej 360 px — cztery
          steppery 56 px + wcięcie nie mieszczą się na 320 px, a zmniejszenie
          przycisków złamałoby minimalny cel dotykowy. Wcięcie jest ozdobą,
          rozmiar przycisku nie. */}
      <div className="mt-2.5 flex gap-2 pl-0 min-[360px]:pl-9">
        <StepperButton
          label="−2.5"
          unit="kilograma"
          onStep={() => {
            onChange({ weight: stepWeight(draft.weight, -WEIGHT_STEP, previous?.weightKg ?? null) });
          }}
        />
        <StepperButton
          label="+2.5"
          unit="kilograma"
          onStep={() => {
            onChange({ weight: stepWeight(draft.weight, WEIGHT_STEP, previous?.weightKg ?? null) });
          }}
        />
        <span className="flex-1" />
        <StepperButton
          label="−1"
          unit="powtórzenie"
          onStep={() => {
            onChange({ reps: stepReps(draft.reps, -REPS_STEP, previous?.reps ?? null) });
          }}
        />
        <StepperButton
          label="+1"
          unit="powtórzenie"
          onStep={() => {
            onChange({ reps: stepReps(draft.reps, REPS_STEP, previous?.reps ?? null) });
          }}
        />
      </div>

      {/* Zawijany, nie przewijany: ostatnia pigułka to „Usuń serię", a ta
          urywała się w pół słowa na krawędzi karty — i wyglądała na zepsutą.
          Rząd znaczników jest krótki i skończony, więc mieści się w dwóch
          liniach zamiast chować akcję za gestem. */}
      <div key={draft.id} className="chip-row-wrap mt-2.5 pl-9">
        <Pill
          active={draft.rpe !== null}
          onClick={() => {
            setRpeOpen((open) => !open);
          }}
          aria-expanded={rpeOpen}
        >
          {draft.rpe === null ? "RPE" : `RPE ${draft.rpe}`}
        </Pill>
        <Pill
          active={draft.toFailure}
          onClick={() => {
            onChange({ toFailure: !draft.toFailure });
          }}
        >
          Do upadku
        </Pill>
        <Pill
          active={draft.assisted}
          onClick={() => {
            onChange({ assisted: !draft.assisted });
          }}
        >
          Z asystą
        </Pill>
        <Pill
          active={draft.isWarmup}
          onClick={() => {
            onChange({ isWarmup: !draft.isWarmup });
          }}
        >
          Rozgrzewka
        </Pill>
        {onDelete !== null && (
          <Pill onClick={onDelete} style={{ color: "var(--critical)" }}>
            Usuń serię
          </Pill>
        )}
      </div>

      {rpeOpen && (
        <div className="chip-row mt-2 pl-9" role="group" aria-label="Ocena wysiłku RPE">
          <Pill
            active={draft.rpe === null}
            onClick={() => {
              onChange({ rpe: null });
              setRpeOpen(false);
            }}
          >
            Bez RPE
          </Pill>
          {RPE_CHIPS.map((value) => (
            <Pill
              key={value}
              active={draft.rpe === value}
              onClick={() => {
                onChange({ rpe: value });
                setRpeOpen(false);
              }}
            >
              {value}
            </Pill>
          ))}
        </div>
      )}

      {/* Miejsce na komunikat walidacji jest zarezerwowane od początku —
          pojawienie się błędu nie przesuwa przycisków pod palcem. */}
      <p
        id={errorId}
        className="meta h-6 pt-2 pl-9"
        style={showMessage ? { color: "var(--critical)" } : undefined}
        role={showMessage ? "alert" : undefined}
      >
        {showMessage ? validation.message : referenceText(reference, index)}
      </p>
    </div>
  );
}
