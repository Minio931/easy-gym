"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Screen, SectionLabel, Skeleton } from "@/components/ui/screen";
import { getWorkout } from "@/lib/api/workouts";
import { isAbortError } from "@/lib/api/errors";
import { formatDuration, formatLongDate, formatVolume, formatWeight, setsLabel } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type {
  PersonalRecordBrokenResponse,
  RepRangeKey,
  WorkoutDetailResponse,
} from "@/types/api";

const REP_RANGE_LABELS: Record<RepRangeKey, string> = {
  ONE: "1",
  TWO_TO_THREE: "2–3",
  FOUR_TO_SIX: "4–6",
  SEVEN_TO_TEN: "7–10",
  ELEVEN_TO_FIFTEEN: "11–15",
  FIFTEEN_PLUS: "15+",
};

/**
 * Podsumowanie treningu (DESIGN §7.5). Liczby bierzemy z serwera — to jedyny
 * ekran, na którym przeglądarka i tak nie policzyłaby `personalRecordsBrokenIn`
 * bez ściągnięcia całej historii każdego ćwiczenia.
 *
 * Gdy nic nie padło, sekcji rekordów NIE MA WCALE — „Brak PR" po ciężkim
 * treningu to komunikat, którego nikt nie chce przeczytać.
 */
export function WorkoutSummary({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const { settings } = useSettings();
  const [workout, setWorkout] = useState<WorkoutDetailResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getWorkout(workoutId, settings.oneRepMaxFormula, controller.signal)
      .then(setWorkout)
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setFailed(true);
        }
      });
    return () => {
      controller.abort();
    };
  }, [workoutId, settings.oneRepMaxFormula]);

  if (workout === null && failed) {
    return (
      <Screen>
        <p className="meta py-8 text-center">Nie udało się wczytać podsumowania.</p>
        <CloseButton onClick={() => router.replace("/pulpit")} />
      </Screen>
    );
  }

  if (workout === null) {
    return (
      <Screen>
        <Skeleton className="mb-3 h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </Screen>
    );
  }

  // `durationSeconds` liczy serwer; wariant zapasowy tylko na wypadek starszej
  // odpowiedzi bez tego pola. Bez `Date.now()` — render musi być czysty.
  const durationSeconds =
    workout.durationSeconds ??
    (workout.endedAt === null
      ? 0
      : Math.max(
          0,
          Math.round(
            (new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 1000,
          ),
        ));

  return (
    <Screen>
      <h2 className="screen-title">Podsumowanie</h2>
      <p className="meta mt-0.5">{formatLongDate(workout.startedAt)}</p>

      <div className="mt-4 flex gap-2">
        <Tile value={formatDuration(durationSeconds)} label="Czas" />
        <Tile value={formatVolume(workout.displayVolumeKg)} label="Objętość kg" />
        <Tile value={String(workout.workingSetCount)} label="Serie" />
      </div>

      {workout.personalRecordsBrokenIn.length > 0 && (
        <section className="mt-8">
          <SectionLabel>Rekordy pobite w tej sesji</SectionLabel>
          <ul className="rounded-card border border-hairline bg-surface">
            {workout.personalRecordsBrokenIn.map((record, index) => (
              <li
                key={`${record.category}-${record.repRange ?? ""}-${record.exerciseId}-${record.setId ?? index}`}
                className={index === 0 ? "" : "border-t border-hairline"}
              >
                <RecordRow record={record} />
              </li>
            ))}
          </ul>
          <p className="meta mt-2">
            Rozgrzewka i serie z asystą nie wchodzą do rekordów. Remis nie liczy się jako pobicie.
          </p>
        </section>
      )}

      <section className="mt-8">
        <SectionLabel>Ćwiczenia</SectionLabel>
        <ul className="rounded-card border border-hairline bg-surface">
          {workout.exercises.map((exercise, index) => (
            <li
              key={exercise.id}
              className={`flex items-center gap-3 px-4 py-3 ${index === 0 ? "" : "border-t border-hairline"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{exercise.exerciseName}</span>
                <span className="meta">{setsLabel(exercise.sets.length)}</span>
              </span>
              <span className="num num-md shrink-0 text-ink-2">
                {formatVolume(exercise.displayVolumeKg)} <span className="meta">kg</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8">
        <CloseButton onClick={() => router.replace("/pulpit")} />
      </div>
    </Screen>
  );
}

/** `replace`, nie `push`: cofnięcie z pulpitu nie może wrócić do podsumowania
 * zamkniętej sesji — z tego ekranu nie ma dokąd wracać. */
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-control w-full rounded-control bg-cta font-semibold text-cta-ink"
    >
      Zamknij podsumowanie
    </button>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-card border border-hairline bg-surface px-1.5 py-3 text-center">
      <p className="num num-lg truncate">{value}</p>
      <p className="label-caps mt-1 truncate">{label}</p>
    </div>
  );
}

function RecordRow({ record }: { record: PersonalRecordBrokenResponse }) {
  const isVolume = record.category === "SESSION_VOLUME";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-[0.06em]"
        style={{ color: "var(--pr)", borderColor: "var(--pr)", backgroundColor: "var(--pr-wash)" }}
      >
        PR
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ink">{categoryLabel(record)}</span>
        <span className="meta block truncate">{record.exerciseName}</span>
      </span>
      <span className="num num-md shrink-0" style={{ color: "var(--pr)" }}>
        {isVolume ? formatVolume(record.value) : formatWeight(record.value)}{" "}
        <span className="meta">kg</span>
      </span>
    </div>
  );
}

function categoryLabel(record: PersonalRecordBrokenResponse): string {
  switch (record.category) {
    case "WEIGHT":
      return "Najwyższy ciężar";
    case "E1RM":
      return "Najwyższy e1RM";
    case "SESSION_VOLUME":
      return "Największa objętość";
    case "REP_RANGE":
      return `PR w zakresie ${record.repRange === null ? "" : REP_RANGE_LABELS[record.repRange]}`;
  }
}
