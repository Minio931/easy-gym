package com.example.easygymbackend.workout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkoutSetRepository extends JpaRepository<WorkoutSet, UUID> {

    /** Izolacja tranzytywna: set -> workout_exercise -> workout.user_id. */
    @Query("""
            SELECT s FROM WorkoutSet s
            WHERE s.id = :id AND s.workoutExercise.workout.userId = :userId AND s.deletedAt IS NULL
            """)
    Optional<WorkoutSet> findVisibleTo(@Param("id") UUID id, @Param("userId") UUID userId);

    @Query("""
            SELECT s FROM WorkoutSet s
            WHERE s.workoutExercise.id = :workoutExerciseId
              AND s.workoutExercise.workout.userId = :userId
              AND s.deletedAt IS NULL
            ORDER BY s.setIndex
            """)
    List<WorkoutSet> findAllVisibleTo(@Param("workoutExerciseId") UUID workoutExerciseId, @Param("userId") UUID userId);

    /** Pod pull synchronizacji -- BEZ filtra deletedAt, tombstone'y muszą się zsynchronizować. */
    @Query("""
            SELECT s FROM WorkoutSet s
            WHERE s.workoutExercise.workout.userId = :userId AND s.updatedAt > :since
            """)
    List<WorkoutSet> findChangedSince(@Param("userId") UUID userId, @Param("since") Instant since);

}
