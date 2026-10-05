package com.example.easygymbackend.metrics;

import java.math.BigDecimal;

/** incomplete = fewer than 2 measurements in the week (section 5 of the prompt). */
public record WeeklyBodyWeightAverage(
        IsoWeek week,
        int measurementCount,
        BigDecimal averageKg,
        boolean incomplete
) {
}
