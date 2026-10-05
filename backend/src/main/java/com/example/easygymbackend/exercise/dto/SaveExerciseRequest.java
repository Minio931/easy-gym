package com.example.easygymbackend.exercise.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * `id` optional: the offline client generates the UUID itself (it has to,
 * via Dexie), but an online-only client may leave it empty and receive a
 * UUID from the server.
 */
public record SaveExerciseRequest(
        UUID id,
        @NotBlank @Size(max = 200) String name,
        @NotBlank @Size(max = 100) String muscleGroup,
        @NotBlank String equipment,
        Boolean isArchived
) {
}
