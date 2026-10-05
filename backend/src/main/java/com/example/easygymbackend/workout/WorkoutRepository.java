package com.example.easygymbackend.workout;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkoutRepository extends JpaRepository<Workout, UUID> {

    Optional<Workout> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<Workout> findByIdAndUserId(UUID id, UUID userId);

    /** Active workout = the latest one without ended_at. "Resume workout" screen after closing the app. */
    Optional<Workout> findFirstByUserIdAndDeletedAtIsNullAndEndedAtIsNullOrderByStartedAtDesc(UUID userId);

    @Query("""
            select new com.example.easygymbackend.workout.WorkoutSummaryRow(
                w.id, w.startedAt, w.endedAt, w.deload, w.notes, w.routineId,
                count(distinct we.id), count(s.id), sum(s.weightKg * s.reps))
            from Workout w
                left join WorkoutExercise we on we.workoutId = w.id and we.deletedAt is null
                left join WorkoutSet s on s.workoutExerciseId = we.id
                    and s.deletedAt is null and s.warmup = false
            where w.userId = :userId
              and w.deletedAt is null
              and w.startedAt >= :from
              and w.startedAt < :to
            group by w.id, w.startedAt, w.endedAt, w.deload, w.notes, w.routineId
            order by w.startedAt desc
            """)
    List<WorkoutSummaryRow> findSummaries(
            @Param("userId") UUID userId,
            @Param("from") Instant from,
            @Param("to") Instant to,
            Pageable pageable);

    @Query("""
            select count(w) from Workout w
            where w.userId = :userId and w.deletedAt is null
              and w.startedAt >= :from and w.startedAt < :to
            """)
    long countInRange(@Param("userId") UUID userId, @Param("from") Instant from, @Param("to") Instant to);

    List<Workout> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);

    List<Workout> findByUserIdAndIdIn(UUID userId, Collection<UUID> ids);

    @Query("select w.id from Workout w where w.id in :ids and w.userId = :userId")
    List<UUID> findOwnedIds(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);

    /**
     * Volume per (workout, muscle group) -- input to the dashboard.
     * SUM/GROUP BY on the database side, per section 9 of the prompt ("do not
     * pull all sets into the service to compute in memory").
     */
    @Query("""
            select new com.example.easygymbackend.dashboard.MuscleGroupVolumeRow(
                w.id, w.startedAt, w.deload, e.muscleGroup, sum(s.weightKg * s.reps), count(s.id))
            from Workout w
                join WorkoutExercise we on we.workoutId = w.id and we.deletedAt is null
                join WorkoutSet s on s.workoutExerciseId = we.id
                    and s.deletedAt is null and s.warmup = false
                join Exercise e on e.id = we.exerciseId
            where w.userId = :userId
              and w.deletedAt is null
              and w.startedAt >= :from
              and w.startedAt < :to
            group by w.id, w.startedAt, w.deload, e.muscleGroup
            order by w.startedAt
            """)
    List<com.example.easygymbackend.dashboard.MuscleGroupVolumeRow> findMuscleGroupVolume(
            @Param("userId") UUID userId,
            @Param("from") Instant from,
            @Param("to") Instant to);

    /**
     * Sessions (workout + sets) for one exercise -- input to the metrics
     * package (e1RM, PR). Returns sets raw, because PRs are computed on the
     * Java side using the user's chosen formula, never from values in the DB.
     */
    @Query("""
            select w, s from Workout w
                join WorkoutExercise we on we.workoutId = w.id and we.deletedAt is null
                join WorkoutSet s on s.workoutExerciseId = we.id and s.deletedAt is null
            where w.userId = :userId
              and w.deletedAt is null
              and we.exerciseId = :exerciseId
              and w.startedAt >= :from
              and w.startedAt < :to
            order by w.startedAt, s.setIndex
            """)
    List<Object[]> findSessionSetsForExercise(
            @Param("userId") UUID userId,
            @Param("exerciseId") UUID exerciseId,
            @Param("from") Instant from,
            @Param("to") Instant to);

}
