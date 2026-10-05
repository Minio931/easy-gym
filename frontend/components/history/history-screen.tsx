"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Screen, SectionLabel, Skeleton } from "@/components/ui/screen";
import { Sheet } from "@/components/ui/sheet";
import { isAbortError, messageForUser } from "@/lib/api/errors";
import { listWorkouts } from "@/lib/api/workouts";
import { deleteWorkoutById } from "@/lib/workout/store";
import {
  exercisesLabel,
  formatDuration,
  formatLongDate,
  formatVolume,
  setsLabel,
} from "@/lib/format";
import type { WorkoutSummaryResponse } from "@/types/api";

/**
 * Workout history. A list of summaries, not full sessions — numbers
 * (volume, sets and exercises count) are computed by the database with
 * `GROUP BY`, not by the browser iterating thousands of sets (PROMPT §9).
 * Session details open the existing summary screen; we do not build a
 * second screen for the same thing.
 */

const PAGE_SIZE = 20;

export function HistoryScreen() {
  const [items, setItems] = useState<WorkoutSummaryResponse[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WorkoutSummaryResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // `loading` starts as true, so we do not set it here again —
    // synchronous setState in an effect is a render cascade (and a lint error).
    void listWorkouts({ limit: PAGE_SIZE, offset: 0, signal: controller.signal })
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (isAbortError(cause)) {
          return;
        }
        setError(messageForUser(cause));
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, []);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    void listWorkouts({ limit: PAGE_SIZE, offset: items.length })
      .then((page) => {
        // Append by `id`, not by index: a new workout could have landed
        // between pages and the offset would shift everything by one,
        // duplicating a row.
        setItems((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...page.items.filter((item) => !known.has(item.id))];
        });
        setTotal(page.total);
        setLoadingMore(false);
      })
      .catch((cause: unknown) => {
        setError(messageForUser(cause));
        setLoadingMore(false);
      });
  }, [items.length]);

  const removeWorkout = useCallback(
    (workout: WorkoutSummaryResponse) => {
      setToDelete(null);
      // The row disappears right away: offline the deletion is still
      // effective (tombstone in Dexie + sync batch), so waiting for the
      // server would keep on screen a workout the user already thinks
      // is gone.
      const index = items.findIndex((item) => item.id === workout.id);
      setItems((current) => current.filter((item) => item.id !== workout.id));
      setTotal((current) => (current === null ? null : Math.max(0, current - 1)));
      setError(null);
      void deleteWorkoutById(workout.id).catch((cause: unknown) => {
        // No-signal does not reach here — the store swallows it and
        // delivers via sync. This is a real server refusal, so the row
        // returns to its place.
        setItems((current) => {
          if (current.some((item) => item.id === workout.id)) {
            return current;
          }
          const restored = [...current];
          restored.splice(index < 0 ? current.length : index, 0, workout);
          return restored;
        });
        setTotal((current) => (current === null ? null : current + 1));
        setError(messageForUser(cause));
      });
    },
    [items],
  );

  if (loading) {
    return (
      <Screen>
        <SectionLabel>Historia</SectionLabel>
        <Skeleton className="mb-2 h-20 w-full" />
        <Skeleton className="mb-2 h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <SectionLabel>Historia</SectionLabel>
        {error === null ? (
          <EmptyState
            message="Nie masz jeszcze zapisanych treningów. Pierwszy pojawi się tu zaraz po zakończeniu sesji."
            action={
              <Link
                href="/trening"
                className="inline-flex h-control items-center rounded-control bg-cta px-6 font-semibold text-cta-ink"
              >
                Zacznij trening
              </Link>
            }
          />
        ) : (
          <EmptyState message={error} />
        )}
      </Screen>
    );
  }

  const hasMore = total !== null && items.length < total;

  return (
    <Screen>
      <SectionLabel>
        {total === null ? "Historia" : `Historia · ${String(total)}`}
      </SectionLabel>

      <ul className="overflow-hidden rounded-card border border-hairline bg-surface">
        {items.map((workout, index) => (
          <li
            key={workout.id}
            className={`flex items-center ${index === 0 ? "" : "border-t border-hairline"}`}
          >
            <WorkoutRow workout={workout} />
            <button
              type="button"
              onClick={() => {
                setToDelete(workout);
              }}
              aria-label={`Usuń trening ${formatLongDate(workout.startedAt)}`}
              className="mr-1 flex size-touch shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {error !== null && <p className="meta mt-3">{error}</p>}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 h-control w-full rounded-control border border-hairline font-semibold text-ink-2 disabled:opacity-60"
        >
          {loadingMore ? "Wczytuję…" : "Pokaż starsze"}
        </button>
      )}

      {toDelete !== null && (
        <Sheet
          title="Usunąć trening?"
          onClose={() => {
            setToDelete(null);
          }}
        >
          {/* Pytamy, bo tu nie ma „Cofnij" jak przy serii: kasowanie idzie
              kaskadą na ćwiczenia i serie, a trening sprzed miesiąca odtwarza
              się z pamięci, nie z ekranu. */}
          <p className="text-ink-2">
            {formatLongDate(toDelete.startedAt)} — {setsLabel(toDelete.setCount)} zniknie z historii,
            z pulpitu i z wykresów. Tego nie da się cofnąć.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setToDelete(null);
              }}
            >
              Zostaw
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                removeWorkout(toDelete);
              }}
            >
              Usuń
            </Button>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

function WorkoutRow({ workout }: { workout: WorkoutSummaryResponse }) {
  // `wroc=historia` makes "Zamknij podsumowanie" return to the list, not
  // the dashboard. After finishing a workout it is the other way around
  // and rightly so — there is nowhere to go back to, because the session
  // is dead.
  return (
    <Link
      href={`/trening/${workout.id}/podsumowanie?wroc=historia`}
      className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 active:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        {/* Data dostaje całą linię. Plakietka „deload" obok niej ścinała rok
            („22.06.20…") — a rok jest tym, czego się w historii szuka. */}
        <span className="block truncate text-ink">{formatLongDate(workout.startedAt)}</span>
        <span className="meta flex items-center gap-1.5 truncate">
          <span className="truncate">
            {workout.durationSeconds === null
              ? "trening w toku"
              : formatDuration(workout.durationSeconds)}
            {" · "}
            {exercisesLabel(workout.exerciseCount)}
            {" · "}
            {setsLabel(workout.setCount)}
          </span>
          {workout.isDeload && (
            <span
              className="shrink-0 rounded-full border px-1.5 text-[11px] font-bold"
              style={{ color: "var(--serious)", borderColor: "var(--serious)" }}
            >
              deload
            </span>
          )}
        </span>
      </span>
      <span className="num num-md shrink-0 text-ink-2">
        {formatVolume(workout.volumeKg)} <span className="meta">kg</span>
      </span>
    </Link>
  );
}
