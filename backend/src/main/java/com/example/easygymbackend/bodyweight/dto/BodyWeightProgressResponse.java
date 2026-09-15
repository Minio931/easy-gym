package com.example.easygymbackend.bodyweight.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Sekcja 5 promptu: surowe pomiary + krocząca 7-dniowa + średnie tygodniowe
 * z deltą tydzień-do-tygodnia (kg i %) + flaga niepełnego tygodnia (&lt;2 pomiary).
 */
public record BodyWeightProgressResponse(
        List<BodyWeightResponse> entries,
        Map<LocalDate, BigDecimal> sevenDayRollingAverage,
        List<WeeklyAverageResponse> weeklyAverages
) {
}
