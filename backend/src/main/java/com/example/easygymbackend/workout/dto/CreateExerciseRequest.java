package com.example.easygymbackend.workout.dto;

import com.example.easygymbackend.workout.Equipment;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** id generowany po stronie klienta (offline-first, sekcja 1.4 promptu) -- nie serwer. */
public record CreateExerciseRequest(
        @NotNull UUID id,
        @NotBlank String name,
        @NotBlank String muscleGroup,
        @NotNull Equipment equipment
) {
}
