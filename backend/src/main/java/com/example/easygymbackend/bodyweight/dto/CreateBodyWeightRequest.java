package com.example.easygymbackend.bodyweight.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * id generowany po stronie klienta. "Jeden wpis na dzień, edytowalny" (sekcja
 * 5 promptu) egzekwowane częściowym unikalnym indeksem w bazie -- druga
 * próba utworzenia NOWEGO wpisu (inny id) na ten sam dzień kończy się 409
 * (DataIntegrityViolationException, globalny handler). Edycja istniejącego
 * dnia idzie przez PATCH pod tym samym id, nie przez ponowny POST.
 */
public record CreateBodyWeightRequest(
        @NotNull UUID id,
        @NotNull LocalDate measuredOn,
        @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax(value = "400", inclusive = false) BigDecimal weightKg,
        String note
) {
}
