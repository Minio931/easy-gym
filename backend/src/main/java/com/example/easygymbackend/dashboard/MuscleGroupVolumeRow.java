package com.example.easygymbackend.dashboard;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Working-set volume grouped in the database by (workout, muscle group).
 * ISO-week bucketing happens only in Java, by the started_at of the WHOLE session --
 * a session ending after midnight must not spread across two weeks
 * (decision from stage 3, CLAUDE.md).
 */
public record MuscleGroupVolumeRow(
        UUID workoutId,
        Instant startedAt,
        boolean deload,
        String muscleGroup,
        BigDecimal volumeKg,
        long setCount
) {
}
