package com.example.easygymbackend.workout.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record SessionVolumeRecordResponse(UUID workoutId, BigDecimal value) {
}
