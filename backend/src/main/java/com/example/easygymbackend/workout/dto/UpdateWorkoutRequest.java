package com.example.easygymbackend.workout.dto;

import java.time.Instant;

/** Częściowa aktualizacja -- null = nie zmieniaj. endedAt ustawiane = "zakończ trening". */
public record UpdateWorkoutRequest(
        Instant endedAt,
        String notes,
        Boolean deload
) {
}
