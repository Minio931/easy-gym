package com.example.easygymbackend.dashboard.dto;

import com.example.easygymbackend.bodyweight.dto.BodyWeightStatsResponse;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Full dashboard data (section 6 of the prompt): weekly volume per muscle
 * group (stacked bar), workout calendar, recent PRs and body weight.
 */
public record DashboardResponse(
        Instant from,
        Instant to,
        Totals totals,
        List<WeeklyVolume> weeklyVolume,
        Trend volumeTrend,
        List<WorkoutDay> workoutDays,
        List<MonthlyWorkouts> workoutsPerMonth,
        List<RecentPersonalRecord> recentPersonalRecords,
        BodyWeightStatsResponse bodyWeight
) {

    public record Totals(long workoutCount, long workingSetCount, BigDecimal volumeKg) {
    }

    public record WeeklyVolume(
            int year,
            int week,
            LocalDate from,
            LocalDate to,
            BigDecimal totalKg,
            Map<String, BigDecimal> byMuscleGroup,
            int workoutCount,
            boolean isDeload
    ) {
    }

    /** Comparison of the latest week to the previous one; null when there is nothing to compare against. */
    public record Trend(BigDecimal previousKg, BigDecimal currentKg, BigDecimal deltaPercent) {
    }

    public record WorkoutDay(LocalDate date, long workoutCount) {
    }

    public record MonthlyWorkouts(String month, long workoutCount) {
    }

    /**
     * A set that at the moment of execution beat the previous weight record of
     * the given exercise -- computed with a window function in SQL, not a loop
     * over history.
     */
    public record RecentPersonalRecord(
            UUID setId,
            UUID exerciseId,
            String exerciseName,
            BigDecimal weightKg,
            int reps,
            Instant achievedAt,
            UUID workoutId
    ) {
    }

}
