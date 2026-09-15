package com.example.easygymbackend.metrics;

import java.math.BigDecimal;

/** incomplete = mniej niż 2 pomiary w tygodniu (sekcja 5 promptu). */
public record WeeklyBodyWeightAverage(
        IsoWeek week,
        int measurementCount,
        BigDecimal averageKg,
        boolean incomplete
) {
}
