package com.example.easygymbackend.exercise;

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
 * user_id NULL = global exercise from the seed (V4), visible to every account
 * and not editable by users. The relation to User is deliberately a bare UUID,
 * not @ManyToOne -- client-synchronized entities never need to load the owner,
 * and a bare column does not tempt lazy loading in a loop.
 */
@Entity
@Table(name = "exercises")
@Getter
@Setter
@NoArgsConstructor
public class Exercise {

    @Id
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    private String name;

    @Column(name = "muscle_group", nullable = false)
    private String muscleGroup;

    @Column(nullable = false)
    private String equipment;

    @Column(name = "is_archived", nullable = false)
    private boolean archived;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    public boolean isGlobal() {
        return userId == null;
    }

}
