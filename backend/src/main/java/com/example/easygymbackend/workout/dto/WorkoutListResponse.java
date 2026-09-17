package com.example.easygymbackend.workout.dto;

import java.util.List;

public record WorkoutListResponse(
        List<WorkoutSummaryResponse> items,
        long total,
        int limit,
        int offset
) {
}
