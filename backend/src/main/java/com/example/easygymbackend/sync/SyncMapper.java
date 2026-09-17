package com.example.easygymbackend.sync;

import com.example.easygymbackend.bodyweight.BodyWeight;
import com.example.easygymbackend.exercise.Exercise;
import com.example.easygymbackend.routine.Routine;
import com.example.easygymbackend.routine.RoutineItem;
import com.example.easygymbackend.sync.dto.SyncRecords;
import com.example.easygymbackend.workout.Workout;
import com.example.easygymbackend.workout.WorkoutExercise;
import com.example.easygymbackend.workout.WorkoutSet;

/** Encja -> rekord paczki sync (kierunek pull). */
final class SyncMapper {

    private SyncMapper() {
    }

    static SyncRecords.ExerciseSync toSync(Exercise entity) {
        return new SyncRecords.ExerciseSync(
                entity.getId(),
                entity.getName(),
                entity.getMuscleGroup(),
                entity.getEquipment(),
                entity.isArchived(),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.getDeletedAt());
    }

    static SyncRecords.RoutineSync toSync(Routine entity) {
        return new SyncRecords.RoutineSync(
                entity.getId(),
                entity.getName(),
                entity.getNotes(),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.getDeletedAt());
    }

    static SyncRecords.RoutineItemSync toSync(RoutineItem entity) {
        return new SyncRecords.RoutineItemSync(
                entity.getId(),
                entity.getRoutineId(),
                entity.getExerciseId(),
                entity.getOrderIndex(),
                entity.getTargetSets(),
                entity.getTargetReps(),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.getDeletedAt());
    }

    static SyncRecords.WorkoutSync toSync(Workout entity) {
        return new SyncRecords.WorkoutSync(
                entity.getId(),
                entity.getStartedAt(),
                entity.getEndedAt(),
                entity.getRoutineId(),
                entity.getNotes(),
                entity.isDeload(),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.getDeletedAt());
    }

    static SyncRecords.WorkoutExerciseSync toSync(WorkoutExercise entity) {
        return new SyncRecords.WorkoutExerciseSync(
                entity.getId(),
                entity.getWorkoutId(),
                entity.getExerciseId(),
                entity.getOrderIndex(),
                entity.getNotes(),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.getDeletedAt());
    }

    static SyncRecords.SetSync toSync(WorkoutSet entity) {
        return new SyncRecords.SetSync(
                entity.getId(),
                entity.getWorkoutExerciseId(),
                entity.getSetIndex(),
                entity.getWeightKg(),
                entity.getReps(),
                entity.getRpe(),
                entity.isWarmup(),
                entity.isToFailure(),
                entity.isAssisted(),
                entity.getCompletedAt(),
                entity.getUpdatedAt(),
                entity.getDeletedAt());
    }

    static SyncRecords.BodyWeightSync toSync(BodyWeight entity) {
        return new SyncRecords.BodyWeightSync(
                entity.getId(),
                entity.getMeasuredOn(),
                entity.getWeightKg(),
                entity.getNote(),
                entity.getUpdatedAt(),
                entity.getDeletedAt());
    }

}
