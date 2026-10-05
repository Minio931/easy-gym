package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Input to the pure functions in this package -- deliberately independent of
 * JPA entities (workouts/sets do not yet exist in the persistence layer, they
 * will appear in later stages). Mirror of the TypeScript lib/metrics.ts on
 * the front end: same rules, same input signature.
 */
public record ExerciseSet(
        UUID setId,
        Instant completedAt,
        BigDecimal weightKg,
        int reps,
        boolean isWarmup,
        boolean toFailure,
        boolean assisted
) {
}
