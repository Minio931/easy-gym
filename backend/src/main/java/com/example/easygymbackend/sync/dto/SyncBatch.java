package com.example.easygymbackend.sync.dto;

import jakarta.validation.Valid;

import java.util.List;

/**
 * Wspólny kształt dla push (request.changes) i pull (response.changes) --
 * ten sam zestaw list w obie strony, symetryczny kontrakt.
 * Listy null traktowane jak puste (patrz SyncService) -- klient nie musi
 * wysyłać kluczy dla typów encji, których nie dotyczy dany batch.
 */
public record SyncBatch(
        @Valid List<ExerciseSyncRecord> exercises,
        @Valid List<WorkoutSyncRecord> workouts,
        @Valid List<WorkoutExerciseSyncRecord> workoutExercises,
        @Valid List<SetSyncRecord> sets,
        @Valid List<BodyWeightSyncRecord> bodyWeights
) {
}
