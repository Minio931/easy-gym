package com.example.easygymbackend.exercise.dto;

import com.example.easygymbackend.exercise.Exercise;

import java.time.Instant;
import java.util.UUID;

/**
 * Response shape = table columns in camelCase (the front end keeps this 1:1
 * in Dexie). `global` is derived (userId == null) and used by the front end
 * to gray out editing/deletion of exercises from the seed.
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
