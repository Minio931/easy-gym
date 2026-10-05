package com.example.easygymbackend.routine;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Routine template item. Inherits its owner from the routine -- per-user
 * isolation is enforced when loading the parent, never via a user_id sent
 * in the body (that column does not exist here at all).
 */
@Entity
@Table(name = "routine_items")
@Getter
@Setter
@NoArgsConstructor
public class RoutineItem {

    @Id
    private UUID id;

    @Column(name = "routine_id", nullable = false)
    private UUID routineId;

    @Column(name = "exercise_id", nullable = false)
    private UUID exerciseId;

    @Column(name = "order_index", nullable = false)
    private int orderIndex;

    @Column(name = "target_sets")
    private Integer targetSets;

    @Column(name = "target_reps")
    private Integer targetReps;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

}
