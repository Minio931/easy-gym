package com.example.easygymbackend.dashboard.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Jeden wiersz "ostatnie PR" (sekcja 6 promptu). category: MAX_WEIGHT / MAX_E1RM / MAX_SESSION_VOLUME. */
public record RecentPersonalRecord(
        UUID exerciseId,
        String exerciseName,
        String category,
        BigDecimal value,
        Instant achievedAt
) {
}
