package com.example.easygymbackend.workout.dto;

import java.util.UUID;

public record StartWorkoutRequest(
        UUID routineId,
        String notes,
        boolean deload
) {
}
