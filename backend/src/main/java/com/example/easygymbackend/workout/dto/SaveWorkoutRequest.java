package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

/**
 * Używane i przy POST, i przy PUT -- PUT nadpisuje komplet pól modyfikowalnych
 * (endedAt = null oznacza "trening nadal trwa", nie "nie zmieniaj").
 * applyRoutine (tylko przy POST): skopiuj pozycje szablonu jako ćwiczenia
 * treningu; domyślnie true, gdy podano routineId.
 */
public record SaveWorkoutRequest(
        UUID id,
        @NotNull Instant startedAt,
        Instant endedAt,
        UUID routineId,
        @Size(max = 2000) String notes,
        Boolean isDeload,
        Boolean applyRoutine
) {
}
