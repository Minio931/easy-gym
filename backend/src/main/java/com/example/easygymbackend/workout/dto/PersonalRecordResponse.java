package com.example.easygymbackend.workout.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Jeden pobity rekord. `category`: WEIGHT / E1RM / SESSION_VOLUME / REP_RANGE.
 * Przy REP_RANGE wypełnione jest `repRange` (ONE, TWO_TO_THREE, ...).
 */
public record PersonalRecordResponse(
        UUID exerciseId,
        String exerciseName,
        String category,
        String repRange,
        BigDecimal value,
        UUID setId,
        UUID workoutId
) {
}
