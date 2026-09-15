package com.example.easygymbackend.workout.dto;

import com.example.easygymbackend.workout.Equipment;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateExerciseRequest(
        @NotBlank String name,
        @NotBlank String muscleGroup,
        @NotNull Equipment equipment
) {
}
