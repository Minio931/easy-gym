package com.example.easygymbackend.dashboard;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Objętość serii roboczych zgrupowana w bazie po (trening, grupa mięśniowa).
 * Bucketowanie na tygodnie ISO robi dopiero Java, po started_at CAŁEJ sesji --
 * sesja kończąca się po północy nie może rozjechać się na dwa tygodnie
 * (decyzja z etapu 3, CLAUDE.md).
 */
public record MuscleGroupVolumeRow(
        UUID workoutId,
        Instant startedAt,
        boolean deload,
        String muscleGroup,
        BigDecimal volumeKg,
        long setCount
) {
}
