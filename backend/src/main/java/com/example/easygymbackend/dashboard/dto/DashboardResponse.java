package com.example.easygymbackend.dashboard.dto;

import com.example.easygymbackend.bodyweight.dto.BodyWeightStatsResponse;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Komplet danych pulpitu (sekcja 6 promptu): objętość tygodniowa per grupa
 * mięśniowa (stacked bar), kalendarz treningów, ostatnie PR i waga ciała.
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

    /** Porównanie ostatniego tygodnia do poprzedniego; null gdy nie ma z czym. */
    public record Trend(BigDecimal previousKg, BigDecimal currentKg, BigDecimal deltaPercent) {
    }

    public record WorkoutDay(LocalDate date, long workoutCount) {
    }

    public record MonthlyWorkouts(String month, long workoutCount) {
    }

    /**
     * Seria, która w momencie wykonania pobiła dotychczasowy rekord ciężaru
     * danego ćwiczenia -- wyliczane funkcją okna w SQL, nie pętlą po historii.
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
