package com.example.easygymbackend.workout.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Pełny trening pod ekran aktywnej sesji i podsumowanie (sekcja 3.6 promptu).
 * personalRecordsBrokenIn to rekordy pobite W MOMENCIE tej sesji, nie
 * "aktualne globalne maksima" -- różnica opisana w metrics/PersonalRecordCalculator.
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
