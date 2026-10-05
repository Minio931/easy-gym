package com.example.easygymbackend.bodyweight.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Upsert by (user, measuredOn): a second entry on the same day edits the existing
 * one, not creating a new one (section 5 of the prompt + partial unique index from V3).
 * The 0-400 kg bounds mirror the CHECK chk_body_weights_weight_kg.
 */
public record SaveBodyWeightRequest(
        UUID id,
        @NotNull LocalDate measuredOn,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @DecimalMax(value = "400.0", inclusive = false)
        BigDecimal weightKg,
        @Size(max = 500) String note
) {
}
