package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * id = nowego wiersza workout_exercises (generowany po stronie klienta),
 * exerciseId = referencja do istniejącego Exercise -- nie mylić.
 */
public record AddExerciseRequest(
        @NotNull UUID id,
        @NotNull UUID exerciseId,
        int orderIndex,
        String notes
) {
}
