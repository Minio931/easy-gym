package com.example.easygymbackend.sync.dto;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Rekordy paczki sync. Kształt = kolumny tabeli w camelCase, bez user_id --
 * właściciela serwer bierze WYŁĄCZNIE z JWT (CurrentUser), a to, co przyśle
 * klient, i tak by zignorował.
 *
 * `updatedAt` jest obowiązkowe w każdym rekordzie: to po nim rozstrzyga się
 * konflikt (last-write-wins). `deletedAt != null` to tombstone -- skasowanie
 * offline musi dojechać na drugie urządzenie, więc nigdy nie ma tu DELETE.
 */
public final class SyncRecords {

    private SyncRecords() {
    }

    public record ExerciseSync(
            @NotNull UUID id,
            String name,
            String muscleGroup,
            String equipment,
            Boolean isArchived,
            Instant createdAt,
            @NotNull Instant updatedAt,
            Instant deletedAt
    ) {
    }

    public record RoutineSync(
            @NotNull UUID id,
            String name,
            String notes,
            Instant createdAt,
            @NotNull Instant updatedAt,
            Instant deletedAt
    ) {
    }

    public record RoutineItemSync(
            @NotNull UUID id,
            @NotNull UUID routineId,
            @NotNull UUID exerciseId,
            int orderIndex,
            Integer targetSets,
            Integer targetReps,
            Instant createdAt,
            @NotNull Instant updatedAt,
            Instant deletedAt
    ) {
    }

    public record WorkoutSync(
            @NotNull UUID id,
            Instant startedAt,
            Instant endedAt,
            UUID routineId,
            String notes,
            Boolean isDeload,
            Instant createdAt,
            @NotNull Instant updatedAt,
            Instant deletedAt
    ) {
    }

    public record WorkoutExerciseSync(
            @NotNull UUID id,
            @NotNull UUID workoutId,
            @NotNull UUID exerciseId,
            int orderIndex,
            String notes,
            Instant createdAt,
            @NotNull Instant updatedAt,
            Instant deletedAt
    ) {
    }

    public record SetSync(
            @NotNull UUID id,
            @NotNull UUID workoutExerciseId,
            int setIndex,
            BigDecimal weightKg,
            int reps,
            BigDecimal rpe,
            Boolean isWarmup,
            Boolean toFailure,
            Boolean assisted,
            Instant completedAt,
            @NotNull Instant updatedAt,
            Instant deletedAt
    ) {
    }

    public record BodyWeightSync(
            @NotNull UUID id,
            LocalDate measuredOn,
            BigDecimal weightKg,
            String note,
            @NotNull Instant updatedAt,
            Instant deletedAt
    ) {
    }

}
