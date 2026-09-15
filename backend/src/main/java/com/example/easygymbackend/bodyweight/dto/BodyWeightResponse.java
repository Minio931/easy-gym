package com.example.easygymbackend.bodyweight.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record BodyWeightResponse(
        UUID id,
        LocalDate measuredOn,
        BigDecimal weightKg,
        String note,
        Instant updatedAt
) {
}
