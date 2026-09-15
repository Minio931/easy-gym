package com.example.easygymbackend.dashboard.dto;

import com.example.easygymbackend.metrics.IsoWeek;

import java.math.BigDecimal;

/**
 * Jeden słupek stacked-bara (sekcja 6 promptu: "objętość tygodniowa per
 * grupa mięśniowa"). Objętość = SUM(weight*reps) z serii nie-warmup,
 * WŁĄCZNIE z assisted (ta sama reguła co SessionMetrics.displayVolumeKg --
 * "wyświetlana" objętość, nie ta PR-owa).
 */
public record WeeklyMuscleGroupVolume(
        IsoWeek week,
        String muscleGroup,
        BigDecimal volumeKg,
        boolean anyDeload
) {
}
