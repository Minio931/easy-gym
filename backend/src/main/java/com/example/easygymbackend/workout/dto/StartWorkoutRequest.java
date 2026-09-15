package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** id generowany po stronie klienta (offline-first, sekcja 1.4 promptu) -- nie serwer. */
public record StartWorkoutRequest(
        @NotNull UUID id,
        UUID routineId,
        String notes,
        boolean deload
) {
}
