package com.example.easygymbackend.workout.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record WorkoutExerciseResponse(
        UUID id,
        UUID workoutId,
        UUID exerciseId,
        String exerciseName,
        String muscleGroup,
        String equipment,
        int orderIndex,
        String notes,
        List<SetResponse> sets,
        BigDecimal displayVolumeKg,
        BigDecimal prEligibleVolumeKg,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {
}
