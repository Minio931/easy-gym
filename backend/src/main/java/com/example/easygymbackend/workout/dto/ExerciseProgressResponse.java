package com.example.easygymbackend.workout.dto;

import java.util.List;
import java.util.UUID;

public record ExerciseProgressResponse(
        UUID exerciseId,
        String exerciseName,
        List<ExerciseProgressPoint> points,
        PersonalRecordsResponse personalRecords
) {
}
