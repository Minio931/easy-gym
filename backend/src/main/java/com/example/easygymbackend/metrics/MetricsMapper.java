package com.example.easygymbackend.metrics;

import com.example.easygymbackend.workout.WorkoutSet;

/**
 * The only bridge between JPA entities and the pure metrics package. Kept
 * here, not in the "computational" metrics/*.java, so those still know
 * nothing about the database (see stage 3 decisions in CLAUDE.md).
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

    /** Parsing of ?formula=epley|brzycki; defaults to Epley. */
    public static OneRepMaxFormula formula(String raw) {
        if (raw == null || raw.isBlank()) {
            return OneRepMaxFormula.EPLEY;
        }
        return switch (raw.trim().toLowerCase()) {
            case "epley" -> OneRepMaxFormula.EPLEY;
            case "brzycki" -> OneRepMaxFormula.BRZYCKI;
            default -> throw new com.example.easygymbackend.common.InvalidRequestException(
                    "Unknown e1RM formula: " + raw + " (allowed: epley, brzycki)");
        };
    }

}
