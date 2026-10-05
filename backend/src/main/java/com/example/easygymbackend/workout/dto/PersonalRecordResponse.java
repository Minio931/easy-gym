package com.example.easygymbackend.workout.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One broken record. `category`: WEIGHT / E1RM / SESSION_VOLUME / REP_RANGE.
 * For REP_RANGE `repRange` is populated (ONE, TWO_TO_THREE, ...).
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
