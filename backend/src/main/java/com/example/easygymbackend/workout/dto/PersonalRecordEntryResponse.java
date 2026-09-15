package com.example.easygymbackend.workout.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record PersonalRecordEntryResponse(UUID setId, BigDecimal value) {
}
