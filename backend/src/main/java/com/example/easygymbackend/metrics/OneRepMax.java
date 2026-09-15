package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;

/**
 * e1RM wg Epleya lub Brzyckiego (sekcja 4 promptu). Dla reps=1 obie formuły
 * matematycznie zwracają ~wagę (Epley naturalnie ~1.033x, Brzycki dokładnie
 * 1x) -- promptu wprost każe dla reps=1 zwracać samą wagę, więc robimy to
 * jednym warunkiem niezależnym od formuły zamiast liczyć i zaokrąglać przez
 * ułamek, który i tak wyjdzie ~tym samym.
 *
 * Brzycki (weight * 36 / (37 - reps)) dzieli przez zero przy reps=37 i daje
 * ujemny, bezsensowny wynik powyżej -- nieprzewidziane w prompt, ale realne:
 * equipment 'bodyweight' + seria do odmowy (to_failure) mogą łatwo dać 40+
 * powtórzeń (np. pompki). Zwracamy Optional.empty() zamiast fałszywej liczby.
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
