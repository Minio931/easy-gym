package com.example.easygymbackend.metrics;

import com.example.easygymbackend.workout.WorkoutSet;

/**
 * Jedyny most między encjami JPA a czystym pakietem metrics. Trzymany tutaj,
 * a nie w metrics/*.java "obliczeniowych", żeby te dalej nie wiedziały nic o
 * bazie (patrz decyzje etapu 3 w CLAUDE.md).
 */
public final class MetricsMapper {

    private MetricsMapper() {
    }

    public static ExerciseSet toExerciseSet(WorkoutSet set) {
        return new ExerciseSet(
                set.getId(),
                set.getCompletedAt(),
                set.getWeightKg(),
                set.getReps(),
                set.isWarmup(),
                set.isToFailure(),
                set.isAssisted());
    }

    /** Parsowanie parametru ?formula=epley|brzycki; domyślnie Epley. */
    public static OneRepMaxFormula formula(String raw) {
        if (raw == null || raw.isBlank()) {
            return OneRepMaxFormula.EPLEY;
        }
        return switch (raw.trim().toLowerCase()) {
            case "epley" -> OneRepMaxFormula.EPLEY;
            case "brzycki" -> OneRepMaxFormula.BRZYCKI;
            default -> throw new com.example.easygymbackend.common.InvalidRequestException(
                    "Nieznana formuła e1RM: " + raw + " (dozwolone: epley, brzycki)");
        };
    }

}
