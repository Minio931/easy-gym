package com.example.easygymbackend.bodyweight.dto;

import com.example.easygymbackend.bodyweight.BodyWeight;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record BodyWeightResponse(
        UUID id,
        LocalDate measuredOn,
        BigDecimal weightKg,
        String note,
        Instant updatedAt,
        Instant deletedAt
) {

    public static BodyWeightResponse from(BodyWeight entry) {
        return new BodyWeightResponse(
                entry.getId(),
                entry.getMeasuredOn(),
                entry.getWeightKg(),
                entry.getNote(),
                entry.getUpdatedAt(),
                entry.getDeletedAt());
    }

}
