package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Granice 0-500 kg / 1-100 powt. / RPE 1-10 są lustrem CHECK-ów z migracji V3
 * -- walidacja tutaj daje 400 z czytelnym komunikatem zamiast 409 z bazy.
 */
public record SaveSetRequest(
        UUID id,
        @Min(0) int setIndex,
        @NotNull @DecimalMin("0.00") @DecimalMax("500.00") BigDecimal weightKg,
        @Min(1) @Max(100) int reps,
        @DecimalMin("1.0") @DecimalMax("10.0") BigDecimal rpe,
        Boolean isWarmup,
        Boolean toFailure,
        Boolean assisted,
        Instant completedAt
) {
}
