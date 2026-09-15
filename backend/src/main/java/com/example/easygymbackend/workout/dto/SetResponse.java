package com.example.easygymbackend.workout.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record SetResponse(
        UUID id,
        int setIndex,
        BigDecimal weightKg,
        int reps,
        BigDecimal rpe,
        boolean warmup,
        boolean toFailure,
        boolean assisted,
        Instant completedAt
) {
}
