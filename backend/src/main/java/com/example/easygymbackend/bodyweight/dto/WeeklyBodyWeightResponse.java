package com.example.easygymbackend.bodyweight.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Tydzień ISO-8601 (poniedziałek-niedziela, Europe/Warsaw) -- ten sam podział
 * co metrics.IsoWeek po stronie serwera i date-fns z weekStartsOn: 1 po
 * stronie frontu. `incomplete` = mniej niż 2 pomiary w tygodniu.
 */
public record WeeklyBodyWeightResponse(
        int year,
        int week,
        LocalDate from,
        LocalDate to,
        int measurementCount,
        BigDecimal averageKg,
        boolean incomplete,
        BigDecimal deltaKg,
        BigDecimal deltaPercent
) {
}
