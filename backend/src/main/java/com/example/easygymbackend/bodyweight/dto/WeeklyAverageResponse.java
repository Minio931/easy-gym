package com.example.easygymbackend.bodyweight.dto;

import com.example.easygymbackend.metrics.IsoWeek;

import java.math.BigDecimal;

public record WeeklyAverageResponse(
        IsoWeek week,
        int measurementCount,
        BigDecimal averageKg,
        boolean incomplete,
        BigDecimal deltaKg,
        BigDecimal deltaPercent
) {
}
