package com.example.easygymbackend.metrics;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class PersonalRecordCalculatorTest {

    private static ExerciseSet set(BigDecimal weight, int reps, boolean warmup, boolean assisted) {
        return new ExerciseSet(UUID.randomUUID(), Instant.now(), weight, reps, warmup, false, assisted);
    }

    private static PersonalRecordCalculator.Session session(List<ExerciseSet> sets) {
        return new PersonalRecordCalculator.Session(UUID.randomUUID(), sets);
    }

    @Test
    void znajdujeNajwiekszyCiezarZPominieciemAssistedIRozgrzewki() {
        ExerciseSet best = set(BigDecimal.valueOf(140), 3, false, false);
        var sessions = List.of(session(List.of(
                set(BigDecimal.valueOf(160), 1, false, true), // ciezszy, ale assisted
                set(BigDecimal.valueOf(200), 1, true, false), // ciezszy, ale rozgrzewka
                best
        )));

        var pr = PersonalRecordCalculator.compute(sessions, OneRepMaxFormula.EPLEY);

        assertThat(pr.maxWeight()).isPresent();
        assertThat(pr.maxWeight().get().setId()).isEqualTo(best.setId());
        assertThat(pr.maxWeight().get().value()).isEqualByComparingTo("140");
    }

    @Test
    void objetoscSesyjnaPrIgnorujeAssistedInaczejNizWyswietlanaObjetosc() {
        UUID workoutId = UUID.randomUUID();
        var withAssisted = new PersonalRecordCalculator.Session(workoutId, List.of(
                set(BigDecimal.valueOf(100), 5, false, false),  // 500 liczy sie do PR
                set(BigDecimal.valueOf(80), 5, false, true)     // 400 NIE liczy sie do PR volume
        ));

        var pr = PersonalRecordCalculator.compute(List.of(withAssisted), OneRepMaxFormula.EPLEY);

        assertThat(pr.maxSessionVolume()).isPresent();
        assertThat(pr.maxSessionVolume().get().value()).isEqualByComparingTo("500");
        assertThat(pr.maxSessionVolume().get().workoutId()).isEqualTo(workoutId);
        // Dla porownania: wyswietlana objetosc TEJ SAMEJ sesji to 900 (z assisted).
        assertThat(SessionMetrics.displayVolumeKg(withAssisted.sets())).isEqualByComparingTo("900");
    }

    @Test
    void rekordPerZakresPowtorzenSledzonyOsobnoNaBucket() {
        ExerciseSet singleRep = set(BigDecimal.valueOf(150), 1, false, false);
        ExerciseSet fiveReps = set(BigDecimal.valueOf(120), 5, false, false);
        var sessions = List.of(session(List.of(singleRep, fiveReps)));

        var pr = PersonalRecordCalculator.compute(sessions, OneRepMaxFormula.EPLEY);

        assertThat(pr.byRepRange().get(RepRangeBucket.ONE).value()).isEqualByComparingTo("150");
        assertThat(pr.byRepRange().get(RepRangeBucket.FOUR_TO_SIX).value()).isEqualByComparingTo("120");
        assertThat(pr.byRepRange()).doesNotContainKey(RepRangeBucket.SEVEN_TO_TEN);
    }

    @Test
    void brokenInZnajdujeTylkoRekordyPobitePrzezOstatniaSesje() {
        var earlierBest = set(BigDecimal.valueOf(100), 5, false, false);
        var later = set(BigDecimal.valueOf(90), 5, false, false); // nie bije rekordu

        var sessions = List.of(
                session(List.of(earlierBest)),
                session(List.of(later))
        );

        var broken = PersonalRecordCalculator.brokenIn(sessions, OneRepMaxFormula.EPLEY);

        assertThat(broken.maxWeight()).isEmpty();
    }

    @Test
    void brokenInWykrywaFaktycznePobicieRekorduWOstatniejSesji() {
        var earlier = set(BigDecimal.valueOf(100), 5, false, false);
        var newRecord = set(BigDecimal.valueOf(110), 5, false, false);

        var sessions = List.of(
                session(List.of(earlier)),
                session(List.of(newRecord))
        );

        var broken = PersonalRecordCalculator.brokenIn(sessions, OneRepMaxFormula.EPLEY);

        assertThat(broken.maxWeight()).isPresent();
        assertThat(broken.maxWeight().get().setId()).isEqualTo(newRecord.setId());
    }

    @Test
    void remisNieLiczySieJakoPobicieRekordu() {
        var first = set(BigDecimal.valueOf(100), 5, false, false);
        var tie = set(BigDecimal.valueOf(100), 5, false, false);

        var sessions = List.of(
                session(List.of(first)),
                session(List.of(tie))
        );

        var broken = PersonalRecordCalculator.brokenIn(sessions, OneRepMaxFormula.EPLEY);

        assertThat(broken.maxWeight()).isEmpty();
    }

    @Test
    void pustaListaSesjiDajePusteRekordy() {
        var pr = PersonalRecordCalculator.compute(List.of(), OneRepMaxFormula.EPLEY);

        assertThat(pr.maxWeight()).isEmpty();
        assertThat(pr.maxE1rm()).isEmpty();
        assertThat(pr.maxSessionVolume()).isEmpty();
        assertThat(pr.byRepRange()).isEmpty();
    }

}
