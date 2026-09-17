package com.example.easygymbackend.sync.dto;

import com.example.easygymbackend.sync.dto.SyncRecords.BodyWeightSync;
import com.example.easygymbackend.sync.dto.SyncRecords.ExerciseSync;
import com.example.easygymbackend.sync.dto.SyncRecords.RoutineItemSync;
import com.example.easygymbackend.sync.dto.SyncRecords.RoutineSync;
import com.example.easygymbackend.sync.dto.SyncRecords.SetSync;
import com.example.easygymbackend.sync.dto.SyncRecords.WorkoutExerciseSync;
import com.example.easygymbackend.sync.dto.SyncRecords.WorkoutSync;
import jakarta.validation.Valid;

import java.util.List;

/**
 * Ta sama struktura w obie strony (push i pull) -- klient nie musi mapować
 * dwóch różnych kształtów. Kolejność pól = kolejność stosowania zmian, bo
 * klucze obce wymagają, żeby rodzic istniał wcześniej.
 */
public record SyncPayload(
        @Valid List<ExerciseSync> exercises,
        @Valid List<RoutineSync> routines,
        @Valid List<RoutineItemSync> routineItems,
        @Valid List<WorkoutSync> workouts,
        @Valid List<WorkoutExerciseSync> workoutExercises,
        @Valid List<SetSync> sets,
        @Valid List<BodyWeightSync> bodyWeights
) {

    public static SyncPayload empty() {
        return new SyncPayload(List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
    }

    public List<ExerciseSync> exercisesOrEmpty() {
        return exercises == null ? List.of() : exercises;
    }

    public List<RoutineSync> routinesOrEmpty() {
        return routines == null ? List.of() : routines;
    }

    public List<RoutineItemSync> routineItemsOrEmpty() {
        return routineItems == null ? List.of() : routineItems;
    }

    public List<WorkoutSync> workoutsOrEmpty() {
        return workouts == null ? List.of() : workouts;
    }

    public List<WorkoutExerciseSync> workoutExercisesOrEmpty() {
        return workoutExercises == null ? List.of() : workoutExercises;
    }

    public List<SetSync> setsOrEmpty() {
        return sets == null ? List.of() : sets;
    }

    public List<BodyWeightSync> bodyWeightsOrEmpty() {
        return bodyWeights == null ? List.of() : bodyWeights;
    }

}
