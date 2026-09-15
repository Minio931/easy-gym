package com.example.easygymbackend.workout;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Nazwana WorkoutSet, nie Set -- tabela to "sets", ale java.util.Set to
 * słowo zarezerwowane dla kolekcji, kolizja nazw byłaby myląca w każdym
 * imporcie. Uwaga: ta tabela (jedyna w training schema) NIE MA created_at --
 * completedAt pełni tę rolę (patrz V3), więc nie dodawaj go tu "dla spójności".
 */
@Entity
@Table(name = "sets")
@Getter
@Setter
@NoArgsConstructor
public class WorkoutSet {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workout_exercise_id", nullable = false)
    private WorkoutExercise workoutExercise;

    @Column(name = "set_index", nullable = false)
    private int setIndex;

    @Column(name = "weight_kg", nullable = false)
    private BigDecimal weightKg;

    @Column(nullable = false)
    private int reps;

    private BigDecimal rpe;

    @Column(name = "is_warmup", nullable = false)
    private boolean warmup;

    @Column(name = "to_failure", nullable = false)
    private boolean toFailure;

    @Column(nullable = false)
    private boolean assisted;

    @Column(name = "completed_at", nullable = false)
    private Instant completedAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

}
