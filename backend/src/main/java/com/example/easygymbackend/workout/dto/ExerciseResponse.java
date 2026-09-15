package com.example.easygymbackend.workout.dto;

import com.example.easygymbackend.workout.Equipment;

import java.util.UUID;

public record ExerciseResponse(
        UUID id,
        String name,
        String muscleGroup,
        Equipment equipment,
        boolean archived,
        boolean global
) {
}
