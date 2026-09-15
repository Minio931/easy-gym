package com.example.easygymbackend.workout;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Jedna sesja (workout) ze swoimi (nieusunietymi) seriami dla jednego ćwiczenia -- wspólne dla ExerciseProgressService i DashboardService. */
public record WorkoutSessionGroup(UUID workoutId, Instant startedAt, boolean deload, List<WorkoutSet> rawSets) {
}
