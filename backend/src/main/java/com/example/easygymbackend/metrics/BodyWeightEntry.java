package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.time.LocalDate;

public record BodyWeightEntry(LocalDate measuredOn, BigDecimal weightKg) {
}
