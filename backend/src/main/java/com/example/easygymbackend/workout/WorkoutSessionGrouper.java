package com.example.easygymbackend.workout;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/**
 * Grupuje płaską listę serii po sesji (workout) -- wejście musi już być
 * posortowane po workout.startedAt (i setIndex w obrębie sesji), żeby
 * kolejność w wyjściowej liście była chronologiczna (LinkedHashMap zachowuje
 * kolejność wstawiania).
 */
public final class WorkoutSessionGrouper {

    private WorkoutSessionGrouper() {
    }

    public static List<WorkoutSessionGroup> groupByWorkout(List<WorkoutSet> sets) {
        LinkedHashMap<UUID, WorkoutSessionGroup> bySession = new LinkedHashMap<>();
        for (WorkoutSet s : sets) {
            Workout workout = s.getWorkoutExercise().getWorkout();
            WorkoutSessionGroup group = bySession.computeIfAbsent(workout.getId(),
                    id -> new WorkoutSessionGroup(id, workout.getStartedAt(), workout.isDeload(), new ArrayList<>()));
            group.rawSets().add(s);
        }
        return new ArrayList<>(bySession.values());
    }

}
