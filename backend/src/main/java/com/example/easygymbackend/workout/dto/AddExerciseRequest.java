package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AddExerciseRequest(
        @NotNull UUID exerciseId,
        int orderIndex,
        String notes
) {
}
