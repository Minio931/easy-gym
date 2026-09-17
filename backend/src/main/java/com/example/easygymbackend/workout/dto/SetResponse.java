package com.example.easygymbackend.workout.dto;

import com.example.easygymbackend.metrics.OneRepMax;
import com.example.easygymbackend.metrics.OneRepMaxFormula;
import com.example.easygymbackend.workout.WorkoutSet;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * e1rmKg liczone na żywo z formuły przekazanej w zapytaniu -- nigdy nie jest
 * trzymane w bazie (zmiana formuły w ustawieniach zafałszowałaby historię).
 * `null` oznacza "formuła nie daje sensownego wyniku" (Brzycki dla reps > 36),
 * nie zero.
 */
public record SetResponse(
        UUID id,
        UUID workoutExerciseId,
        int setIndex,
        BigDecimal weightKg,
        int reps,
        BigDecimal rpe,
        boolean isWarmup,
        boolean toFailure,
        boolean assisted,
        BigDecimal e1rmKg,
        Instant completedAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public static SetResponse from(WorkoutSet set, OneRepMaxFormula formula) {
        return new SetResponse(
                set.getId(),
                set.getWorkoutExerciseId(),
                set.getSetIndex(),
                set.getWeightKg(),
                set.getReps(),
                set.getRpe(),
                set.isWarmup(),
                set.isToFailure(),
                set.isAssisted(),
                OneRepMax.estimate(set.getWeightKg(), set.getReps(), formula).orElse(null),
                set.getCompletedAt(),
                set.getUpdatedAt(),
                set.getDeletedAt());
    }

}
