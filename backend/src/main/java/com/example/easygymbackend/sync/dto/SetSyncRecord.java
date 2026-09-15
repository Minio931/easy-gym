package com.example.easygymbackend.sync.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record SetSyncRecord(
        @NotNull UUID id,
        @NotNull UUID workoutExerciseId,
        @Min(1) int setIndex,
        @NotNull @DecimalMin("0") @DecimalMax("500") BigDecimal weightKg,
        @Min(1) @Max(100) int reps,
        @DecimalMin("1") @DecimalMax("10") BigDecimal rpe,
        boolean warmup,
        boolean toFailure,
        boolean assisted,
        @NotNull Instant completedAt,
        @NotNull Instant updatedAt,
        Instant deletedAt
) {
}
