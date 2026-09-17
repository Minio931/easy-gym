package com.example.easygymbackend.routine.dto;

import com.example.easygymbackend.routine.RoutineItem;

import java.time.Instant;
import java.util.UUID;

public record RoutineItemResponse(
        UUID id,
        UUID routineId,
        UUID exerciseId,
        int orderIndex,
        Integer targetSets,
        Integer targetReps,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public static RoutineItemResponse from(RoutineItem item) {
        return new RoutineItemResponse(
                item.getId(),
                item.getRoutineId(),
                item.getExerciseId(),
                item.getOrderIndex(),
                item.getTargetSets(),
                item.getTargetReps(),
                item.getCreatedAt(),
                item.getUpdatedAt(),
                item.getDeletedAt());
    }

}
