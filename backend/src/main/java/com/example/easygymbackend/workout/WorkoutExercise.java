package com.example.easygymbackend.workout;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "workout_exercises")
@Getter
@Setter
@NoArgsConstructor
public class WorkoutExercise {

    @Id
    private UUID id;

    @Column(name = "workout_id", nullable = false)
    private UUID workoutId;

    @Column(name = "exercise_id", nullable = false)
    private UUID exerciseId;

    @Column(name = "order_index", nullable = false)
    private int orderIndex;

    @Column
    private String notes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

}
