package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;

/**
 * e1RM per Epley or Brzycki (section 4 of the prompt). For reps=1 both formulas
 * mathematically return ~the weight (Epley naturally ~1.033x, Brzycki exactly
 * 1x) -- the prompt explicitly says to return the raw weight for reps=1, so we
 * do that with a single formula-independent branch instead of computing and
 * rounding through a fraction that would come out ~the same anyway.
 *
 * Brzycki (weight * 36 / (37 - reps)) divides by zero at reps=37 and yields a
 * negative, meaningless result above that -- unanticipated in the prompt but
 * real: equipment 'bodyweight' + a to_failure set can easily reach 40+ reps
 * (e.g. push-ups). We return Optional.empty() instead of a false number.
 */
public final class OneRepMax {

    private static final BigDecimal EPLEY_REPS_DIVISOR = BigDecimal.valueOf(30);
    private static final BigDecimal BRZYCKI_NUMERATOR = BigDecimal.valueOf(36);
    private static final int BRZYCKI_MAX_VALID_REPS = 36;

    private OneRepMax() {
    }

    public static Optional<BigDecimal> estimate(BigDecimal weightKg, int reps, OneRepMaxFormula formula) {
        if (reps == 1) {
            return Optional.of(weightKg.setScale(2, RoundingMode.HALF_UP));
        }

        return switch (formula) {
            case EPLEY -> Optional.of(epley(weightKg, reps));
            case BRZYCKI -> brzycki(weightKg, reps);
        };
    }

    private static BigDecimal epley(BigDecimal weightKg, int reps) {
        BigDecimal factor = BigDecimal.ONE.add(
                BigDecimal.valueOf(reps).divide(EPLEY_REPS_DIVISOR, 10, RoundingMode.HALF_UP));
        return weightKg.multiply(factor).setScale(2, RoundingMode.HALF_UP);
    }

    private static Optional<BigDecimal> brzycki(BigDecimal weightKg, int reps) {
        if (reps > BRZYCKI_MAX_VALID_REPS) {
            return Optional.empty();
        }
        BigDecimal denominator = BigDecimal.valueOf(37 - reps);
        BigDecimal result = weightKg.multiply(BRZYCKI_NUMERATOR).divide(denominator, 10, RoundingMode.HALF_UP);
        return Optional.of(result.setScale(2, RoundingMode.HALF_UP));
    }

}
