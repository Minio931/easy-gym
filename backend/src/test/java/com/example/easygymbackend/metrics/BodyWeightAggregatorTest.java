package com.example.easygymbackend.metrics;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BodyWeightAggregatorTest {

    @Test
    void grupujePomiaryWTygodnieIliczySrednia() {
        // Poniedzialek-sroda tego samego tygodnia ISO.
        var entries = List.of(
                new BodyWeightEntry(LocalDate.of(2026, 6, 8), BigDecimal.valueOf(80)),
                new BodyWeightEntry(LocalDate.of(2026, 6, 9), BigDecimal.valueOf(81)),
                new BodyWeightEntry(LocalDate.of(2026, 6, 10), BigDecimal.valueOf(82))
        );

        var weeks = BodyWeightAggregator.weeklyAverages(entries);

        assertThat(weeks).hasSize(1);
        assertThat(weeks.get(0).measurementCount()).isEqualTo(3);
        assertThat(weeks.get(0).averageKg()).isEqualByComparingTo("81.00");
        assertThat(weeks.get(0).incomplete()).isFalse();
    }

    @Test
    void tydzienZJednymPomiaremOznaczonyJakoNiepelny() {
        var entries = List.of(new BodyWeightEntry(LocalDate.of(2026, 6, 8), BigDecimal.valueOf(80)));

        var weeks = BodyWeightAggregator.weeklyAverages(entries);

        assertThat(weeks.get(0).incomplete()).isTrue();
        assertThat(weeks.get(0).measurementCount()).isEqualTo(1);
    }

    @Test
    void deltaTydzienDoTygodniaLiczonaWzgledemPoprzedniego() {
        var week1 = new WeeklyBodyWeightAverage(new IsoWeek(2026, 23), 3, new BigDecimal("80.00"), false);
        var week2 = new WeeklyBodyWeightAverage(new IsoWeek(2026, 24), 3, new BigDecimal("81.00"), false);
        var weeks = List.of(week1, week2);

        var deltaKg = BodyWeightAggregator.weekOverWeekDeltaKg(weeks, new IsoWeek(2026, 24));
        var deltaPercent = BodyWeightAggregator.weekOverWeekDeltaPercent(weeks, new IsoWeek(2026, 24));

        assertThat(deltaKg).contains(new BigDecimal("1.00"));
        assertThat(deltaPercent).contains(new BigDecimal("1.25"));
    }

    @Test
    void brakPoprzedniegoTygodniaDajePustaDelte() {
        var week1 = new WeeklyBodyWeightAverage(new IsoWeek(2026, 23), 3, new BigDecimal("80.00"), false);

        assertThat(BodyWeightAggregator.weekOverWeekDeltaKg(List.of(week1), new IsoWeek(2026, 23))).isEmpty();
    }

    @Test
    void srodkowa7DniowaLiczySieZOkna() {
        var entries = List.of(
                new BodyWeightEntry(LocalDate.of(2026, 6, 1), BigDecimal.valueOf(80)),
                new BodyWeightEntry(LocalDate.of(2026, 6, 2), BigDecimal.valueOf(82))
        );

        var rolling = BodyWeightAggregator.sevenDayRollingAverage(entries);

        assertThat(rolling.get(LocalDate.of(2026, 6, 1))).isEqualByComparingTo("80.00");
        assertThat(rolling.get(LocalDate.of(2026, 6, 2))).isEqualByComparingTo("81.00");
    }

}
