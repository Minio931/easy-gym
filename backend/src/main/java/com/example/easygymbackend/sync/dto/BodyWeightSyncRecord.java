package com.example.easygymbackend.sync.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record BodyWeightSyncRecord(
        @NotNull UUID id,
        @NotNull LocalDate measuredOn,
        @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax(value = "400", inclusive = false) BigDecimal weightKg,
        String note,
        @NotNull Instant updatedAt,
        Instant deletedAt
) {
}
