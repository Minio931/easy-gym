package com.example.easygymbackend.sync.dto;

import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

public record WorkoutExerciseSyncRecord(
        @NotNull UUID id,
        @NotNull UUID workoutId,
        @NotNull UUID exerciseId,
        int orderIndex,
        String notes,
        @NotNull Instant updatedAt,
        Instant deletedAt
) {
}
