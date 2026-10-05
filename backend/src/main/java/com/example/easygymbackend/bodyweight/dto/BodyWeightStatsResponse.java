package com.example.easygymbackend.bodyweight.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Full data for the body-weight screen: raw measurements (light points on the chart),
 * weekly averages (thick line), 7-day rolling average, and 4-week trend.
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

    /** Comparison of the latest week's average with the average from 4 weeks of data earlier. */
    public record Trend(
            int fromYear, int fromWeek, int toYear, int toWeek,
            BigDecimal fromAverageKg, BigDecimal toAverageKg,
            BigDecimal deltaKg, BigDecimal deltaPercent) {
    }

}
