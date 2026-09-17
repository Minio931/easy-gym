"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, Screen, SectionLabel, Skeleton } from "@/components/ui/screen";
import { isAbortError, messageForUser } from "@/lib/api/errors";
import { listWorkouts } from "@/lib/api/workouts";
import {
  exercisesLabel,
  formatDuration,
  formatLongDate,
  formatVolume,
  setsLabel,
} from "@/lib/format";
import type { WorkoutSummaryResponse } from "@/types/api";

/**
 * Historia treningów. Lista podsumowań, nie pełnych sesji — liczby (objętość,
 * liczba serii i ćwiczeń) liczy baza w `GROUP BY`, a nie przeglądarka pętlą po
 * tysiącach serii (PROMPT §9). Szczegóły sesji otwiera ekran podsumowania,
 * który już istnieje; drugiego takiego ekranu nie budujemy.
 */

const PAGE_SIZE = 20;

export function HistoryScreen() {
  const [items, setItems] = useState<WorkoutSummaryResponse[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // `loading` startuje jako true, więc nie ustawiamy go tu ponownie —
    // synchroniczne setState w efekcie to kaskada renderów (i błąd lintu).
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
        // Doklejamy po `id`, nie po indeksie: między stronami mógł dojść nowy
        // trening i offset przesunąłby wszystko o jeden, dublując wiersz.
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
          <li key={workout.id} className={index === 0 ? "" : "border-t border-hairline"}>
            <WorkoutRow workout={workout} />
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
    </Screen>
  );
}

function WorkoutRow({ workout }: { workout: WorkoutSummaryResponse }) {
  // `wroc=historia` sprawia, że „Zamknij podsumowanie" wraca na listę, a nie na
  // pulpit. Po zakończeniu treningu jest odwrotnie i słusznie -- tam nie ma
  // dokąd wracać, bo sesja już nie żyje.
  return (
    <Link
      href={`/trening/${workout.id}/podsumowanie?wroc=historia`}
      className="flex items-center gap-3 px-4 py-3 active:bg-surface-2"
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
