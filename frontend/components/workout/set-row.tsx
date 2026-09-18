"use client";

import { useRef, useState } from "react";
import { formatWeight } from "@/lib/format";
import { markersText, referenceText } from "@/lib/workout/reference";
import type { ExerciseReference } from "@/lib/workout/store";
import { CheckIcon } from "@/components/ui/icons";
import type { SetResponse } from "@/types/api";

/** Próg swipe'a i czas long-pressa — obie drogi prowadzą do tego samego usunięcia. */
const SWIPE_THRESHOLD_PX = 96;
const SWIPE_MAX_PX = 120;
const LONG_PRESS_MS = 500;

/**
 * Wiersz zatwierdzonej serii: stan spoczynkowy listy. Tap w dowolne miejsce
 * wraca do edycji, swipe w lewo albo long-press usuwa.
 *
 * Gest NIE jest jedyną drogą do usunięcia — pigułka „Usuń serię" siedzi w
 * wierszu aktywnym (DESIGN §9, spec §3). To jest wymóg dostępności, nie
 * podwójna funkcja z rozpędu.
 */
export function SetRow({
  set,
  index,
  reference,
  isRecord,
  onEdit,
  onDelete,
}: {
  set: SetResponse;
  index: number;
  reference: ExerciseReference | undefined;
  isRecord: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelLongPress = () => {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const meta = [referenceText(reference, index), markersText(set)].filter((part) => part !== "");

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex w-full items-center justify-end rounded-control pr-4 text-[13px] font-semibold"
        style={{
          backgroundColor: "var(--critical)",
          color: "var(--ink)",
          opacity: offset < 0 ? 1 : 0,
        }}
      >
        Usuń
      </div>

      <div
        className="relative touch-pan-y rounded-control pt-1"
        style={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 ? "transform 120ms ease-out" : undefined,
          backgroundColor: isRecord ? "var(--pr-wash)" : "var(--surface)",
        }}
        onPointerDown={(event) => {
          startRef.current = { x: event.clientX, y: event.clientY };
          swipingRef.current = false;
          longPressRef.current = setTimeout(() => {
            suppressClickRef.current = true;
            onDelete();
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(event) => {
          const start = startRef.current;
          if (start === null) {
            return;
          }
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (!swipingRef.current && (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy))) {
            if (Math.abs(dy) > 8) {
              cancelLongPress();
              startRef.current = null;
            }
            return;
          }
          swipingRef.current = true;
          cancelLongPress();
          setOffset(Math.max(-SWIPE_MAX_PX, Math.min(0, dx)));
        }}
        onPointerUp={() => {
          cancelLongPress();
          startRef.current = null;
          if (swipingRef.current) {
            suppressClickRef.current = true;
            if (offset <= -SWIPE_THRESHOLD_PX) {
              onDelete();
            }
          }
          setOffset(0);
        }}
        onPointerCancel={() => {
          cancelLongPress();
          startRef.current = null;
          setOffset(0);
        }}
      >
        <button
          type="button"
          // Bez `opacity` na całej treści: przygaszało liczby, czyli zapis
          // wykonanej pracy, zostawiając jasny kafelek ✓ jako najgłośniejszy
          // element wiersza. Hierarchię niesie teraz wiersz AKTYWNY (obwódka
          // akcentem + jasne ✓), a nie wyblakły wiersz zatwierdzony.
          className="flex h-11 w-full items-center gap-3 rounded-control px-1 text-left"
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            onEdit();
          }}
        >
          <span className="w-6 shrink-0 text-center">
            {set.isWarmup ? (
              <span className="inline-block rounded-full bg-surface-3 px-[7px] py-0.5 text-[12px] leading-4 font-semibold text-ink-2">
                R
              </span>
            ) : (
              <span className="meta">{index + 1}</span>
            )}
          </span>
          <span className="num num-md flex-1 truncate">
            {formatWeight(set.weightKg)} <span className="meta">kg</span> × {set.reps}{" "}
            <span className="meta">powt.</span>
          </span>
          {/* 36 px, stonowany: to ZNACZNIK STANU („zrobione"), nie przycisk.
              Pełne 48 px w kolorze CTA wypełniało wiersz od krawędzi do
              krawędzi i robiło z listy serii kolumnę jasnych bloków głośniejszą
              niż same liczby — a jedynym przyciskiem do naciśnięcia jest ✓
              w wierszu aktywnym. */}
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-control border border-hairline bg-surface-2 text-ink-2"
          >
            <CheckIcon strokeWidth={2.2} />
          </span>
          <span className="sr-only">Edytuj serię {index + 1}</span>
        </button>

        {/* Wysokość 16 px jest zarezerwowana ZAWSZE — plakietka PR i znaczniki
            dopisują się do istniejącej linijki, więc autozapis nie przesuwa listy. */}
        <p className="meta mt-0.5 flex h-4 items-center gap-2 pb-1.5 pl-9">
          {isRecord && (
            <span
              className="rounded-full border px-2 text-[11px] leading-4 font-bold tracking-[0.06em]"
              style={{
                color: "var(--pr)",
                borderColor: "var(--pr)",
                backgroundColor: "var(--pr-wash)",
              }}
            >
              PR
            </span>
          )}
          <span className="truncate">{meta.join(" · ")}</span>
        </p>
      </div>
    </div>
  );
}
