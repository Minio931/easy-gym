package com.example.easygymbackend.routine.dto;

import com.example.easygymbackend.routine.Routine;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record RoutineResponse(
        UUID id,
        String name,
        String notes,
        List<RoutineItemResponse> items,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public static RoutineResponse from(Routine routine, List<RoutineItemResponse> items) {
        return new RoutineResponse(
                routine.getId(),
                routine.getName(),
                routine.getNotes(),
                items,
                routine.getCreatedAt(),
                routine.getUpdatedAt(),
                routine.getDeletedAt());
    }

}
