package com.example.easygymbackend.workout.dto;

import java.time.Instant;
import java.util.UUID;

/** Bez zagnieżdżonych ćwiczeń/serii -- do listy historii (GET /api/workouts). */
public record WorkoutSummaryResponse(
        UUID id,
        Instant startedAt,
        Instant endedAt,
        String notes,
        boolean deload
) {
}
