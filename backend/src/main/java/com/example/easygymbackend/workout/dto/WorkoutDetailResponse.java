package com.example.easygymbackend.workout.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Full workout for the active session screen and summary (section 3.6 of the
 * prompt). personalRecordsBrokenIn are records broken AT THE MOMENT of this
 * session, not "current global maxima" -- the distinction is documented in
 * metrics/PersonalRecordCalculator.
 */
public record WorkoutDetailResponse(
        UUID id,
        Instant startedAt,
        Instant endedAt,
        Long durationSeconds,
        boolean isDeload,
        String notes,
        UUID routineId,
        List<WorkoutExerciseResponse> exercises,
        BigDecimal displayVolumeKg,
        BigDecimal prEligibleVolumeKg,
        long workingSetCount,
        List<PersonalRecordResponse> personalRecordsBrokenIn,
        Instant createdAt,
        Instant updatedAt
) {
}
