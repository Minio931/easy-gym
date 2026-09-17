package com.example.easygymbackend.bodyweight.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Upsert po (user, measuredOn): drugi wpis tego samego dnia edytuje istniejący,
 * nie tworzy nowego (sekcja 5 promptu + częściowy indeks unikalny z V3).
 * Granice 0-400 kg to lustro CHECK-a chk_body_weights_weight_kg.
 */
public record SaveBodyWeightRequest(
        UUID id,
        @NotNull LocalDate measuredOn,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @DecimalMax(value = "400.0", inclusive = false)
        BigDecimal weightKg,
        @Size(max = 500) String note
) {
}
