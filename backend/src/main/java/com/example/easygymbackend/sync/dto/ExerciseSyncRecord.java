package com.example.easygymbackend.sync.dto;

import com.example.easygymbackend.workout.Equipment;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

/**
 * updatedAt/deletedAt przychodzą OD KLIENTA -- to jest sedno LWW offline-first
 * (sekcja 1.4 promptu). Serwer NIE generuje tych wartości sam (w odróżnieniu
 * od zwykłego CRUD w pakiecie workout, gdzie @UpdateTimestamp robi to za nas).
 */
public record ExerciseSyncRecord(
        @NotNull UUID id,
        @NotBlank String name,
        @NotBlank String muscleGroup,
        @NotNull Equipment equipment,
        boolean archived,
        @NotNull Instant updatedAt,
        Instant deletedAt
) {
}
