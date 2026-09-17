package com.example.easygymbackend.workout;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Wiersz listy treningów policzony w bazie (GROUP BY), nie pętlą po seriach
 * w serwisie -- lista historii ma sięgać całej historii konta.
 * volumeKg/setCount liczone TYLKO z serii roboczych (rozgrzewka odfiltrowana
 * w JOIN-ie), assisted wliczone -- to "displayVolume" z sekcji 4 promptu.
 */
public record WorkoutSummaryRow(
        UUID id,
        Instant startedAt,
        Instant endedAt,
        boolean deload,
        String notes,
        UUID routineId,
        long exerciseCount,
        long setCount,
        BigDecimal volumeKg
) {
}
