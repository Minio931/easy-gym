package com.example.easygymbackend.bodyweight.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;

import java.math.BigDecimal;

/** measuredOn celowo nieedytowalne -- zmiana dnia to nowy wpis (usuń + utwórz), nie przesunięcie istniejącego. */
public record UpdateBodyWeightRequest(
        @DecimalMin(value = "0", inclusive = false) @DecimalMax(value = "400", inclusive = false) BigDecimal weightKg,
        String note
) {
}
