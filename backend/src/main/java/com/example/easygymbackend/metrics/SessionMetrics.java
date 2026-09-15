package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public final class SessionMetrics {

    private SessionMetrics() {
    }

    /**
     * Objętość sesji do WYŚWIETLENIA userowi -- włącznie z seriami assisted
     * (fizyczna praca i tak została wykonana), zawsze z pominięciem rozgrzewki.
     * To INNA liczba niż {@link #prEligibleVolumeKg} -- ta druga, używana
     * tylko do trackingu PR "największa objętość w sesji", assisted wyklucza.
     * Sekcja 4 promptu rozróżnia te dwa przypadki wprost, mimo że brzmią
     * jak ten sam wzór na pierwszy rzut oka.
     */
    public static BigDecimal displayVolumeKg(List<ExerciseSet> sets) {
        return sumVolume(workingSets(sets));
    }

    public static BigDecimal prEligibleVolumeKg(List<ExerciseSet> sets) {
        return sumVolume(workingSets(sets).stream().filter(s -> !s.assisted()).toList());
    }

    /** Najcięższa seria w sesji: max ciężar wśród nie-assisted, remis -> więcej powtórzeń. */
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
