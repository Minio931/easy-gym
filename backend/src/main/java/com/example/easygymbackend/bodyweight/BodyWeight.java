package com.example.easygymbackend.bodyweight;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Jeden ŻYWY wpis na (user_id, measured_on) -- pilnuje tego częściowy indeks
 * unikalny w V3 (WHERE deleted_at IS NULL). Tabela nie ma created_at.
 */
@Entity
@Table(name = "body_weights")
@Getter
@Setter
@NoArgsConstructor
public class BodyWeight {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "measured_on", nullable = false)
    private LocalDate measuredOn;

    @Column(name = "weight_kg", nullable = false, precision = 5, scale = 2)
    private BigDecimal weightKg;

    @Column
    private String note;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

}
