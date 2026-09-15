package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;

public record AddSetRequest(
        @NotNull @Min(1) Integer setIndex,
        @NotNull @DecimalMin("0") @DecimalMax("500") BigDecimal weightKg,
        @NotNull @Min(1) @Max(100) Integer reps,
        @DecimalMin("1") @DecimalMax("10") BigDecimal rpe,
        boolean warmup,
        boolean toFailure,
        boolean assisted,
        Instant completedAt
) {
}
