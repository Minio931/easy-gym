package com.example.easygymbackend.sync.dto;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Sync batch records. Shape = table columns in camelCase, without user_id --
 * the server takes the owner ONLY from the JWT (CurrentUser) and would ignore
 * anything the client sent anyway.
 *
 * `updatedAt` is mandatory on every record: this is what conflict resolution
 * uses (last-write-wins). `deletedAt != null` is a tombstone -- an offline
 * delete must reach the other device, so there is never a DELETE here.
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
