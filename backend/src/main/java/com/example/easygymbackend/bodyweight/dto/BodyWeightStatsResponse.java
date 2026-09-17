package com.example.easygymbackend.bodyweight.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Komplet danych ekranu wagi: surowe pomiary (jasne punkty na wykresie),
 * średnie tygodniowe (gruba linia), krocząca 7-dniowa i trend 4-tygodniowy.
 */
public record BodyWeightStatsResponse(
        List<BodyWeightResponse> entries,
        List<WeeklyBodyWeightResponse> weekly,
        List<RollingPoint> rollingSevenDay,
        BodyWeightResponse latest,
        Trend fourWeekTrend
) {

    public record RollingPoint(LocalDate date, BigDecimal averageKg) {
    }

    /** Porównanie średniej ostatniego tygodnia ze średnią sprzed 4 tygodni z danymi. */
    public record Trend(
            int fromYear, int fromWeek, int toYear, int toWeek,
            BigDecimal fromAverageKg, BigDecimal toAverageKg,
            BigDecimal deltaKg, BigDecimal deltaPercent) {
    }

}
