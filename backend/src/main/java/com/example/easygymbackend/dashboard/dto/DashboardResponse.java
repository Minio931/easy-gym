package com.example.easygymbackend.dashboard.dto;

import java.util.List;

public record DashboardResponse(
        List<WeeklyMuscleGroupVolume> weeklyVolumeByMuscleGroup,
        List<DailyWorkoutCount> workoutsByDay,
        List<RecentPersonalRecord> recentPersonalRecords
) {
}
