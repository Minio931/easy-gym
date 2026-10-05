package com.example.easygymbackend.bodyweight.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * ISO-8601 week (Monday-Sunday, Europe/Warsaw) -- same split as metrics.IsoWeek
 * on the server side and date-fns with weekStartsOn: 1 on the front end.
 * `incomplete` = fewer than 2 measurements in the week.
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
