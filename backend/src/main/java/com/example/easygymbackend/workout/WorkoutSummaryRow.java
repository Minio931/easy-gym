package com.example.easygymbackend.workout;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Workout-list row computed in the database (GROUP BY), not by looping over
 * sets in the service -- the history list may span the entire account history.
 * volumeKg/setCount are computed ONLY from working sets (warmup filtered out
 * in the JOIN), assisted included -- this is "displayVolume" from section 4
 * of the prompt.
 */
public record WorkoutSummaryRow(
        UUID id,
        Instant startedAt,
        Instant endedAt,
        boolean deload,
        String notes,
        UUID routineId,
        long exerciseCount,
        long setCount,
        BigDecimal volumeKg
) {
}
