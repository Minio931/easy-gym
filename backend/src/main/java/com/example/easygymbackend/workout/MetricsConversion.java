package com.example.easygymbackend.workout;

import com.example.easygymbackend.metrics.ExerciseSet;

import java.util.List;

/** WorkoutSet (encja) -> ExerciseSet (metrics, niezależne od JPA) -- wspólne dla wszystkiego co woła pakiet metrics. */
public final class MetricsConversion {

    private MetricsConversion() {
    }

    public static List<ExerciseSet> toMetricsSets(List<WorkoutSet> sets) {
        return sets.stream().map(MetricsConversion::toMetricsSet).toList();
    }

    public static ExerciseSet toMetricsSet(WorkoutSet s) {
        return new ExerciseSet(
                s.getId(), s.getCompletedAt(), s.getWeightKg(), s.getReps(), s.isWarmup(), s.isToFailure(), s.isAssisted());
    }

}
