package com.example.easygymbackend.workout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkoutExerciseRepository extends JpaRepository<WorkoutExercise, UUID> {

    /**
     * Izolacja przez JOIN do workouts.user_id -- workout_exercises nie ma
     * własnej kolumny user_id, więc własność zawsze sprawdzana tranzytywnie
     * przez rodzica (patrz decyzja 2 w CLAUDE.md).
     */
    @Query("""
            SELECT we FROM WorkoutExercise we
            WHERE we.id = :id AND we.workout.userId = :userId AND we.deletedAt IS NULL
            """)
    Optional<WorkoutExercise> findVisibleTo(@Param("id") UUID id, @Param("userId") UUID userId);

    @Query("""
            SELECT we FROM WorkoutExercise we
            WHERE we.workout.id = :workoutId AND we.workout.userId = :userId AND we.deletedAt IS NULL
            ORDER BY we.orderIndex
            """)
    List<WorkoutExercise> findAllVisibleTo(@Param("workoutId") UUID workoutId, @Param("userId") UUID userId);

}
