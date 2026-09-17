package com.example.easygymbackend.exercise.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * `id` opcjonalne: klient offline generuje UUID sam (i tak musi, przez Dexie),
 * ale online-only klient może je zostawić puste i dostać UUID z serwera.
 */
public record SaveExerciseRequest(
        UUID id,
        @NotBlank @Size(max = 200) String name,
        @NotBlank @Size(max = 100) String muscleGroup,
        @NotBlank String equipment,
        Boolean isArchived
) {
}
