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
 * user_id NULL = ćwiczenie globalne z seeda (V4), widoczne dla każdego konta
 * i nieedytowalne przez usera. Relacja do User celowo jako goły UUID, nie
 * @ManyToOne -- encje synchronizowane z klienta nigdy nie potrzebują ładować
 * właściciela, a goła kolumna nie kusi do lazy loadingu w pętli.
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
