package com.example.easygymbackend.workout.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

/**
 * Used both on POST and on PUT -- PUT overwrites the full set of modifiable
 * fields (endedAt = null means "workout still ongoing", not "do not change").
 * applyRoutine (only on POST): copy routine items as workout exercises;
 * defaults to true when routineId is provided.
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
