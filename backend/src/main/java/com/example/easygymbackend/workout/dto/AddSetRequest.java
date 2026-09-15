package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** id generowany po stronie klienta (offline-first, sekcja 1.4 promptu) -- nie serwer. */
public record AddSetRequest(
        @NotNull UUID id,
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
