package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.math.BigDecimal;

/** Częściowa aktualizacja -- pole null = "nie zmieniaj", nie "wyczyść" (poza rpe, patrz SetService). */
public record UpdateSetRequest(
        @Min(1) Integer setIndex,
        @DecimalMin("0") @DecimalMax("500") BigDecimal weightKg,
        @Min(1) @Max(100) Integer reps,
        @DecimalMin("1") @DecimalMax("10") BigDecimal rpe,
        Boolean warmup,
        Boolean toFailure,
        Boolean assisted
) {
}
