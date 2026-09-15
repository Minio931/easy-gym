package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Wejście do czystych funkcji w tym pakiecie -- celowo niezależne od encji
 * JPA (workouts/sets jeszcze nie istnieją w warstwie persystencji, dojdą w
 * kolejnych etapach). Mirror TypeScriptowego lib/metrics.ts po stronie
 * frontu: te same reguły, ta sama sygnatura danych wejściowych.
 */
public record ExerciseSet(
        UUID setId,
        Instant completedAt,
        BigDecimal weightKg,
        int reps,
        boolean isWarmup,
        boolean toFailure,
        boolean assisted
) {
}
