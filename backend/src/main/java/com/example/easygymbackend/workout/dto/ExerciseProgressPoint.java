package com.example.easygymbackend.workout.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Jeden punkt głównego wykresu ćwiczenia (sekcja 4 promptu) -- najcięższa
 * seria danej sesji, opisana liczbą powtórzeń: "102.5 kg × 5 @RPE 8".
 * rpe nullable (jak w schemacie), e1rm nullable (Brzycki dla reps > 36 --
 * patrz OneRepMax -- nie ma sensownej wartości).
 */
public record ExerciseProgressPoint(
        UUID workoutId,
        Instant startedAt,
        boolean deload,
        BigDecimal weightKg,
        int reps,
        BigDecimal rpe,
        boolean toFailure,
        BigDecimal e1rm,
        BigDecimal sessionVolumeKg
) {
}
