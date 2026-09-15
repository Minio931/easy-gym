package com.example.easygymbackend.sync.dto;

import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

public record WorkoutSyncRecord(
        @NotNull UUID id,
        @NotNull Instant startedAt,
        Instant endedAt,
        UUID routineId,
        String notes,
        boolean deload,
        @NotNull Instant updatedAt,
        Instant deletedAt
) {
}
