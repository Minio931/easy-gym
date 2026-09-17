package com.example.easygymbackend.exercise.dto;

import com.example.easygymbackend.workout.dto.SetResponse;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Dane pod ekran pojedynczego ćwiczenia (sekcja 6 promptu): progresja ciężaru
 * z kontekstem powtórzeń, e1RM w czasie, objętość na sesję. Sesje w kolejności
 * chronologicznej -- wykres rysuje je od lewej, a metrics liczy PR po kolei.
 */
public record ExerciseHistoryResponse(
        UUID exerciseId,
        String name,
        String muscleGroup,
        String equipment,
        List<Session> sessions,
        PersonalRecordsResponse personalRecords
) {

    public record Session(
            UUID workoutId,
            Instant startedAt,
            boolean isDeload,
            List<SetResponse> sets,
            BigDecimal displayVolumeKg,
            BigDecimal prEligibleVolumeKg,
            SetResponse heaviestSet,
            BigDecimal bestE1rmKg
    ) {
    }

}
