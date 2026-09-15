package com.example.easygymbackend.workout.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record WorkoutDetailResponse(
        UUID id,
        Instant startedAt,
        Instant endedAt,
        UUID routineId,
        String notes,
        boolean deload,
        List<WorkoutExerciseResponse> exercises
) {
}
