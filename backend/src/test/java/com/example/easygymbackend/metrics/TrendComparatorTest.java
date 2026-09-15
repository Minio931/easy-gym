package com.example.easygymbackend.metrics;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TrendComparatorTest {

    @Test
    void domyslnieDeloadZnikaZLancuchaPorownan() {
        // W1: 1000 (normalny), W2: 400 (deload), W3: 1050 (powrot do normy)
        var weeks = List.of(
                new TrendComparator.WeeklyValue(new IsoWeek(2026, 1), BigDecimal.valueOf(1000), false),
                new TrendComparator.WeeklyValue(new IsoWeek(2026, 2), BigDecimal.valueOf(400), true),
                new TrendComparator.WeeklyValue(new IsoWeek(2026, 3), BigDecimal.valueOf(1050), false)
        );

        // Tydzień 3 (powrot do normy) porownywany do tygodnia 1 (ostatni nie-deload),
        // NIE do deloadu -- inaczej wygladaloby to jak +162% zamiast realnych +5%.
        var result = TrendComparator.compareToPreviousWeek(weeks, new IsoWeek(2026, 3), false);

        assertThat(result).isPresent();
        assertThat(result.get().previousValue()).isEqualByComparingTo("1000");
        assertThat(result.get().currentValue()).isEqualByComparingTo("1050");
        assertThat(result.get().deltaPercent()).isEqualByComparingTo("5.00");
    }

    @Test
    void samTydzienDeloadNieMaPorownaniaWTrybieDomyslnym() {
        var weeks = List.of(
                new TrendComparator.WeeklyValue(new IsoWeek(2026, 1), BigDecimal.valueOf(1000), false),
                new TrendComparator.WeeklyValue(new IsoWeek(2026, 2), BigDecimal.valueOf(400), true)
        );

        var result = TrendComparator.compareToPreviousWeek(weeks, new IsoWeek(2026, 2), false);

        assertThat(result).isEmpty();
    }

    @Test
    void includeDeloadWlaczaDeloadZPowrotemDoLancucha() {
        var weeks = List.of(
                new TrendComparator.WeeklyValue(new IsoWeek(2026, 1), BigDecimal.valueOf(1000), false),
                new TrendComparator.WeeklyValue(new IsoWeek(2026, 2), BigDecimal.valueOf(400), true)
        );

        var result = TrendComparator.compareToPreviousWeek(weeks, new IsoWeek(2026, 2), true);

        assertThat(result).isPresent();
        assertThat(result.get().previousValue()).isEqualByComparingTo("1000");
        assertThat(result.get().currentValue()).isEqualByComparingTo("400");
        assertThat(result.get().deltaPercent()).isEqualByComparingTo("-60.00");
    }

    @Test
    void pierwszyTydzienBezPoprzednikaNieMaPorownania() {
        var weeks = List.of(new TrendComparator.WeeklyValue(new IsoWeek(2026, 1), BigDecimal.valueOf(1000), false));

        assertThat(TrendComparator.compareToPreviousWeek(weeks, new IsoWeek(2026, 1), false)).isEmpty();
    }

}
