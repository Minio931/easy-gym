package com.example.easygymbackend.workout.dto;

import java.util.List;
import java.util.UUID;

public record WorkoutExerciseResponse(
        UUID id,
        UUID exerciseId,
        String exerciseName,
        int orderIndex,
        String notes,
        List<SetResponse> sets
) {
}
