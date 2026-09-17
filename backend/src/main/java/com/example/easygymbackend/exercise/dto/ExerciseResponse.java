package com.example.easygymbackend.exercise.dto;

import com.example.easygymbackend.exercise.Exercise;

import java.time.Instant;
import java.util.UUID;

/**
 * Kształt odpowiedzi = kolumny tabeli w camelCase (front trzyma to 1:1 w
 * Dexie). `global` jest wyliczone (userId == null) i służy frontowi do
 * wyszarzenia edycji/usuwania ćwiczeń z seeda.
 */
public record ExerciseResponse(
        UUID id,
        UUID userId,
        String name,
        String muscleGroup,
        String equipment,
        boolean isArchived,
        boolean global,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public static ExerciseResponse from(Exercise exercise) {
        return new ExerciseResponse(
                exercise.getId(),
                exercise.getUserId(),
                exercise.getName(),
                exercise.getMuscleGroup(),
                exercise.getEquipment(),
                exercise.isArchived(),
                exercise.isGlobal(),
                exercise.getCreatedAt(),
                exercise.getUpdatedAt(),
                exercise.getDeletedAt());
    }

}
