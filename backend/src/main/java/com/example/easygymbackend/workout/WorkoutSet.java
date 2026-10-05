package com.example.easygymbackend.workout;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * The `sets` table (SET is an SQL keyword, hence the class name WorkoutSet).
 * Note: this table has NO created_at column -- it is ordered by completed_at
 * and updated_at is sufficient for LWW.
 */
@Entity
@Table(name = "sets")
@Getter
@Setter
@NoArgsConstructor
public class WorkoutSet {

    @Id
    private UUID id;

    @Column(name = "workout_exercise_id", nullable = false)
    private UUID workoutExerciseId;

    @Column(name = "set_index", nullable = false)
    private int setIndex;

    @Column(name = "weight_kg", nullable = false, precision = 6, scale = 2)
    private BigDecimal weightKg;

    @Column(nullable = false)
    private int reps;

    @Column(precision = 3, scale = 1)
    private BigDecimal rpe;

    @Column(name = "is_warmup", nullable = false)
    private boolean warmup;

    @Column(name = "to_failure", nullable = false)
    private boolean toFailure;

    @Column(nullable = false)
    private boolean assisted;

    @Column(name = "completed_at", nullable = false)
    private Instant completedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

}
