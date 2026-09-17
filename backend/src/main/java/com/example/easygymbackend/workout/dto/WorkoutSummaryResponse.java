package com.example.easygymbackend.workout.dto;

import com.example.easygymbackend.workout.WorkoutSummaryRow;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Pozycja listy historii. volumeKg = objętość serii roboczych (z assisted),
 * policzona SUM-em w bazie -- patrz WorkoutSummaryRow.
 */
public record WorkoutSummaryResponse(
        UUID id,
        Instant startedAt,
        Instant endedAt,
        Long durationSeconds,
        boolean isDeload,
        String notes,
        UUID routineId,
        long exerciseCount,
        long setCount,
        BigDecimal volumeKg
) {

    public static WorkoutSummaryResponse from(WorkoutSummaryRow row) {
        return new WorkoutSummaryResponse(
                row.id(),
                row.startedAt(),
                row.endedAt(),
                durationSeconds(row.startedAt(), row.endedAt()),
                row.deload(),
                row.notes(),
                row.routineId(),
                row.exerciseCount(),
                row.setCount(),
                row.volumeKg() == null ? BigDecimal.ZERO : row.volumeKg());
    }

    public static Long durationSeconds(Instant startedAt, Instant endedAt) {
        return endedAt == null ? null : Duration.between(startedAt, endedAt).toSeconds();
    }

}
