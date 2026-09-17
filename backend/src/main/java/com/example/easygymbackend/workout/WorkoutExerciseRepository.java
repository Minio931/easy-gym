package com.example.easygymbackend.workout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkoutExerciseRepository extends JpaRepository<WorkoutExercise, UUID> {

    List<WorkoutExercise> findByWorkoutIdAndDeletedAtIsNullOrderByOrderIndexAsc(UUID workoutId);

    Optional<WorkoutExercise> findByIdAndWorkoutId(UUID id, UUID workoutId);

    /** Zakres usera przez workout -- ta tabela nie ma własnego user_id. */
    @Query("""
            select we from WorkoutExercise we
            where we.updatedAt > :since
              and we.workoutId in (select w.id from Workout w where w.userId = :userId)
            """)
    List<WorkoutExercise> findChangedSince(@Param("userId") UUID userId, @Param("since") Instant since);

    @Query("""
            select we from WorkoutExercise we
            where we.id in :ids
              and we.workoutId in (select w.id from Workout w where w.userId = :userId)
            """)
    List<WorkoutExercise> findOwnedByIds(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);

    @Query("""
            select we.id from WorkoutExercise we
            where we.id in :ids
              and we.workoutId in (select w.id from Workout w where w.userId = :userId)
            """)
    List<UUID> findOwnedIds(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);

}
