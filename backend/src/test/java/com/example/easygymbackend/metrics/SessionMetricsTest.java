package com.example.easygymbackend.metrics;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SessionMetricsTest {

    private static ExerciseSet set(BigDecimal weight, int reps, boolean warmup, boolean assisted) {
        return new ExerciseSet(UUID.randomUUID(), Instant.now(), weight, reps, warmup, false, assisted);
    }

    @Test
    void displayVolumeWliczaAssistedIPomijaRozgrzewke() {
        List<ExerciseSet> sets = List.of(
                set(BigDecimal.valueOf(20), 10, true, false),   // rozgrzewka -- pominięta
                set(BigDecimal.valueOf(100), 5, false, false),  // 500
                set(BigDecimal.valueOf(80), 5, false, true)     // 400, assisted, ale liczy się do objętości
        );

        assertThat(SessionMetrics.displayVolumeKg(sets)).isEqualByComparingTo("900");
    }

    @Test
    void prEligibleVolumeWykluczaAssistedIRozgrzewke() {
        List<ExerciseSet> sets = List.of(
                set(BigDecimal.valueOf(20), 10, true, false),
                set(BigDecimal.valueOf(100), 5, false, false),
                set(BigDecimal.valueOf(80), 5, false, true)
        );

        assertThat(SessionMetrics.prEligibleVolumeKg(sets)).isEqualByComparingTo("500");
    }

    @Test
    void heaviestSetPomijaAssistedIRozgrzewke() {
        ExerciseSet heaviestNonAssisted = set(BigDecimal.valueOf(120), 3, false, false);
        List<ExerciseSet> sets = List.of(
                set(BigDecimal.valueOf(150), 1, false, true), // ciezszy, ale assisted -- wykluczony
                set(BigDecimal.valueOf(200), 1, true, false), // ciezszy, ale rozgrzewka -- wykluczony
                heaviestNonAssisted
        );

        Optional<ExerciseSet> result = SessionMetrics.heaviestSet(sets);

        assertThat(result).contains(heaviestNonAssisted);
    }

    @Test
    void heaviestSetPrzyRemisieWygrywaWiekszaLiczbaPowtorzen() {
        ExerciseSet fewerReps = set(BigDecimal.valueOf(100), 3, false, false);
        ExerciseSet moreReps = set(BigDecimal.valueOf(100), 8, false, false);
        List<ExerciseSet> sets = List.of(fewerReps, moreReps);

        Optional<ExerciseSet> result = SessionMetrics.heaviestSet(sets);

        assertThat(result).contains(moreReps);
    }

    @Test
    void pustaListaZwracaZeroObjetosciIBrakNajciezszejSerii() {
        assertThat(SessionMetrics.displayVolumeKg(List.of())).isEqualByComparingTo("0");
        assertThat(SessionMetrics.heaviestSet(List.of())).isEmpty();
    }

}
