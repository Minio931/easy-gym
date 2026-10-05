package com.example.easygymbackend.exercise.dto;

import com.example.easygymbackend.workout.dto.SetResponse;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Data for the single-exercise screen (section 6 of the prompt): weight
 * progression with rep context, e1RM over time, volume per session. Sessions
 * in chronological order -- the chart draws them left-to-right and metrics
 * computes PRs in sequence.
 */
public record ExerciseHistoryResponse(
        UUID exerciseId,
        String name,
        String muscleGroup,
        String equipment,
        List<Session> sessions,
        PersonalRecordsResponse personalRecords
) {

    public record Session(
            UUID workoutId,
            Instant startedAt,
            boolean isDeload,
            List<SetResponse> sets,
            BigDecimal displayVolumeKg,
            BigDecimal prEligibleVolumeKg,
            SetResponse heaviestSet,
            BigDecimal bestE1rmKg
    ) {
    }

}
