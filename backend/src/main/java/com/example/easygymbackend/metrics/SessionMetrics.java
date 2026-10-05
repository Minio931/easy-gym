package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public final class SessionMetrics {

    private SessionMetrics() {
    }

    /**
     * Session volume for DISPLAY to the user -- including assisted sets
     * (the physical work was done anyway), always excluding warmup.
     * This is a DIFFERENT number than {@link #prEligibleVolumeKg} -- that
     * one, used only for PR tracking of "greatest session volume", excludes
     * assisted. Section 4 of the prompt distinguishes these two cases
     * explicitly, even though they sound like the same formula at a glance.
     */
    public static BigDecimal displayVolumeKg(List<ExerciseSet> sets) {
        return sumVolume(workingSets(sets));
    }

    public static BigDecimal prEligibleVolumeKg(List<ExerciseSet> sets) {
        return sumVolume(workingSets(sets).stream().filter(s -> !s.assisted()).toList());
    }

    /** Heaviest set in a session: max weight among non-assisted, tie -> more reps. */
    public static Optional<ExerciseSet> heaviestSet(List<ExerciseSet> sets) {
        return workingSets(sets).stream()
                .filter(s -> !s.assisted())
                .max(Comparator.comparing(ExerciseSet::weightKg).thenComparing(ExerciseSet::reps));
    }

    private static BigDecimal sumVolume(List<ExerciseSet> sets) {
        return sets.stream()
                .map(s -> s.weightKg().multiply(BigDecimal.valueOf(s.reps())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static List<ExerciseSet> workingSets(List<ExerciseSet> sets) {
        return sets.stream().filter(s -> !s.isWarmup()).toList();
    }

}
