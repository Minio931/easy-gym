package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record SaveWorkoutExerciseRequest(
        UUID id,
        @NotNull UUID exerciseId,
        @Min(0) int orderIndex,
        @Size(max = 2000) String notes
) {
}
