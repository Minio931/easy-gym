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
 * The 0-500 kg / 1-100 reps / RPE 1-10 bounds mirror the CHECKs from
 * migration V3 -- validation here gives 400 with a readable message instead
 * of 409 from the database.
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
