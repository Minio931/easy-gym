"use client";

import { Sheet } from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import { formatDuration, formatVolume, pluralPl, setsLabel } from "@/lib/format";
import type { WorkoutDetailResponse } from "@/types/api";

/** Wiersze z danymi, których user nie zatwierdził, nie trafią do bazy — trzeba
 * o tym powiedzieć wprost, zanim trening zostanie zamknięty. */
function unconfirmedNotice(count: number): string {
  if (count === 1) {
    return "Masz 1 niezatwierdzoną serię. Zostanie pominięta.";
  }
  const noun = pluralPl(count, "", "niezatwierdzone serie", "niezatwierdzonych serii");
  return `Masz ${count} ${noun}. Zostaną pominięte.`;
}

/**
 * Jedyny modal na tym ekranie. Zakończenie treningu jest nieodwracalne po
 * stronie UI (sesja znika z `/active`), więc dostaje potwierdzenie — w
 * odróżnieniu od usunięcia serii, które ma „Cofnij".
 */
export function FinishSheet({
  workout,
  elapsedSeconds,
  unconfirmedCount,
  busy,
  onDeloadChange,
  onConfirm,
  onClose,
}: {
  workout: WorkoutDetailResponse;
  elapsedSeconds: number;
  unconfirmedCount: number;
  busy: boolean;
  onDeloadChange: (isDeload: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Zakończ trening" onClose={onClose}>
      <div className="px-4 pt-5 pb-6">
        <h2 className="screen-title">Zakończyć trening?</h2>
        <p className="mt-2 text-ink-2">
          Czas: {formatDuration(elapsedSeconds)}, {setsLabel(workout.workingSetCount)},{" "}
          {formatVolume(workout.displayVolumeKg)} kg.
        </p>

        {unconfirmedCount > 0 && (
          <p className="meta mt-3" style={{ color: "var(--warning)" }}>
            {unconfirmedNotice(unconfirmedCount)}
          </p>
        )}

        <div className="mt-5 border-t border-hairline pt-2">
          <Toggle label="To był deload" checked={workout.isDeload} onChange={onDeloadChange} />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="h-control w-full rounded-control bg-cta font-semibold text-cta-ink disabled:opacity-45"
          >
            Zakończ
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-control w-full rounded-control border border-hairline font-semibold text-ink-2"
          >
            Wróć do treningu
          </button>
        </div>
      </div>
    </Sheet>
  );
}
