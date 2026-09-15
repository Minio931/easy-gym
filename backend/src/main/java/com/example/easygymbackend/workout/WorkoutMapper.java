package com.example.easygymbackend.workout;

import com.example.easygymbackend.workout.dto.ExerciseResponse;
import com.example.easygymbackend.workout.dto.SetResponse;
import com.example.easygymbackend.workout.dto.WorkoutDetailResponse;
import com.example.easygymbackend.workout.dto.WorkoutExerciseResponse;
import com.example.easygymbackend.workout.dto.WorkoutSummaryResponse;

import java.util.List;

final class WorkoutMapper {

    private WorkoutMapper() {
    }

    static ExerciseResponse toResponse(Exercise exercise) {
        return new ExerciseResponse(
                exercise.getId(), exercise.getName(), exercise.getMuscleGroup(),
                exercise.getEquipment(), exercise.isArchived(), exercise.getUserId() == null);
    }

    static SetResponse toResponse(WorkoutSet set) {
        return new SetResponse(
                set.getId(), set.getSetIndex(), set.getWeightKg(), set.getReps(), set.getRpe(),
                set.isWarmup(), set.isToFailure(), set.isAssisted(), set.getCompletedAt());
    }

    static WorkoutExerciseResponse toResponse(WorkoutExercise workoutExercise, List<SetResponse> sets) {
        return new WorkoutExerciseResponse(
                workoutExercise.getId(), workoutExercise.getExercise().getId(),
                workoutExercise.getExercise().getName(), workoutExercise.getOrderIndex(),
                workoutExercise.getNotes(), sets);
    }

    static WorkoutSummaryResponse toSummary(Workout workout) {
        return new WorkoutSummaryResponse(
                workout.getId(), workout.getStartedAt(), workout.getEndedAt(),
                workout.getNotes(), workout.isDeload());
    }

    static WorkoutDetailResponse toDetail(Workout workout, List<WorkoutExerciseResponse> exercises) {
        return new WorkoutDetailResponse(
                workout.getId(), workout.getStartedAt(), workout.getEndedAt(), workout.getRoutineId(),
                workout.getNotes(), workout.isDeload(), exercises);
    }

}
