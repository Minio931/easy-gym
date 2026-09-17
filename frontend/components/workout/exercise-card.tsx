"use client";

import { formatVolume, pluralPl } from "@/lib/format";
import type { SetDraft } from "@/lib/workout/draft";
import { isRecordSet } from "@/lib/workout/reference";
import type { ExerciseReference } from "@/lib/workout/store";
import { ActiveSetRow } from "@/components/workout/active-set-row";
import { PendingSetRow } from "@/components/workout/pending-set-row";
import { SetRow } from "@/components/workout/set-row";
import { MoreIcon, PlusIcon } from "@/components/ui/icons";
import type { PersonalRecordBrokenResponse, SetResponse, WorkoutExerciseResponse } from "@/types/api";

/**
 * Karta ćwiczenia w treningu (DESIGN §7.2). Lista serii to wiersze rozdzielone
 * włosem, nie osiem zagnieżdżonych kart — zagnieżdżone karty na 390 px zjadają
 * 32 px szerokości i nie wnoszą nic.
 */
export function ExerciseCard({
  exercise,
  draft,
  isActive,
  reference,
  records,
  targetSets,
  onOpenMenu,
  onDraftChange,
  onConfirm,
  onActivateDraft,
  onEditSet,
  onDeleteSet,
  onAddSet,
  onCopyPrevious,
}: {
  exercise: WorkoutExerciseResponse;
  draft: SetDraft | undefined;
  isActive: boolean;
  reference: ExerciseReference | undefined;
  records: readonly PersonalRecordBrokenResponse[];
  targetSets: number | undefined;
  onOpenMenu: () => void;
  onDraftChange: (patch: Partial<SetDraft>) => void;
  onConfirm: () => void;
  onActivateDraft: () => void;
  onEditSet: (set: SetResponse) => void;
  onDeleteSet: (set: SetResponse) => void;
  onAddSet: () => void;
  onCopyPrevious: () => void;
}) {
  const workingSets = exercise.sets.filter((set) => !set.isWarmup);
  const lastSet = exercise.sets.at(-1);
  const draftHasValues = draft !== undefined && (draft.weight !== "" || draft.reps !== "");
  const draftIsNew = draft !== undefined && !draft.editing;

  return (
    <section
      id={`cwiczenie-${exercise.id}`}
      className="rounded-card border border-hairline bg-surface px-3.5 pt-3.5 pb-3"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="screen-title truncate">{exercise.exerciseName}</h2>
          <p className="meta mt-0.5 truncate">{headerMeta(exercise, targetSets)}</p>
        </div>
        {targetSets !== undefined && (
          <span className="num num-md pt-1 text-ink-3 tabular-nums">
            {workingSets.length}/{targetSets}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenMenu}
          className="-mt-1 -mr-2 grid size-touch shrink-0 place-items-center rounded-full text-ink-3 active:bg-surface-2"
        >
          <MoreIcon />
          <span className="sr-only">Opcje ćwiczenia {exercise.exerciseName}</span>
        </button>
      </div>

      <ul className="mt-2.5">
        {exercise.sets.map((set, index) => (
          <li key={set.id} className="border-t border-hairline">
            {isActive && draft?.id === set.id ? (
              <ActiveSetRow
                draft={draft}
                index={index}
                reference={reference}
                onChange={onDraftChange}
                onConfirm={onConfirm}
                onDelete={() => {
                  onDeleteSet(set);
                }}
              />
            ) : (
              <SetRow
                set={set}
                index={index}
                reference={reference}
                isRecord={isRecordSet(set, records)}
                onEdit={() => {
                  onEditSet(set);
                }}
                onDelete={() => {
                  onDeleteSet(set);
                }}
              />
            )}
          </li>
        ))}

        {draftIsNew && (isActive || draftHasValues) && (
          <li className="border-t border-hairline">
            {isActive ? (
              <ActiveSetRow
                draft={draft}
                index={exercise.sets.length}
                reference={reference}
                onChange={onDraftChange}
                onConfirm={onConfirm}
                onDelete={null}
              />
            ) : (
              <PendingSetRow
                draft={draft}
                index={exercise.sets.length}
                onActivate={onActivateDraft}
              />
            )}
          </li>
        )}
      </ul>

      {exercise.sets.length === 0 && draft === undefined && (
        <p className="meta border-t border-hairline py-3">Brak serii. Dodaj pierwszą.</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={onAddSet}
          className="flex h-control w-full items-center justify-center gap-2 rounded-control border border-hairline text-[15px] font-semibold text-ink active:bg-surface-2"
        >
          <PlusIcon width={18} height={18} />
          Dodaj serię
        </button>
        {lastSet !== undefined && (
          <button
            type="button"
            onClick={onCopyPrevious}
            className="h-8 text-[13px] text-ink-3 active:text-ink-2"
          >
            Kopiuj poprzednią serię
          </button>
        )}
      </div>
    </section>
  );
}

function headerMeta(exercise: WorkoutExerciseResponse, targetSets: number | undefined): string {
  if (exercise.sets.length > 0) {
    return `${exercise.muscleGroup} · ${formatVolume(exercise.displayVolumeKg)} kg w tej sesji`;
  }
  if (targetSets !== undefined) {
    const noun = pluralPl(
      targetSets,
      "seria zaplanowana",
      "serie zaplanowane",
      "serii zaplanowanych",
    );
    return `${exercise.muscleGroup} · ${targetSets} ${noun}`;
  }
  return exercise.muscleGroup;
}
