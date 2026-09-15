package com.example.easygymbackend.dashboard.dto;

import java.time.LocalDate;

/** Jedna komórka heatmapy/kalendarza (sekcja 6 promptu: "liczba treningów w miesiącu"). */
public record DailyWorkoutCount(
        LocalDate date,
        int workoutCount,
        boolean anyDeload
) {
}
