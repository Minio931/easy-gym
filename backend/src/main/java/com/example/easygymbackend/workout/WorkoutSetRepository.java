package com.example.easygymbackend.workout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkoutSetRepository extends JpaRepository<WorkoutSet, UUID> {

    List<WorkoutSet> findByWorkoutExerciseIdInAndDeletedAtIsNullOrderBySetIndexAsc(Collection<UUID> workoutExerciseIds);

    Optional<WorkoutSet> findByIdAndWorkoutExerciseId(UUID id, UUID workoutExerciseId);

    @Query("""
            select s from WorkoutSet s
            where s.updatedAt > :since
              and s.workoutExerciseId in (
                  select we.id from WorkoutExercise we
                  where we.workoutId in (select w.id from Workout w where w.userId = :userId))
            """)
    List<WorkoutSet> findChangedSince(@Param("userId") UUID userId, @Param("since") Instant since);

    @Query("""
            select s from WorkoutSet s
            where s.id in :ids
              and s.workoutExerciseId in (
                  select we.id from WorkoutExercise we
                  where we.workoutId in (select w.id from Workout w where w.userId = :userId))
            """)
    List<WorkoutSet> findOwnedByIds(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);

}
