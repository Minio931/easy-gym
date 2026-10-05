package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Optional;

/**
 * Week-over-week comparison with default skipping of deload weeks/sessions
 * (section 4 of the prompt: a deliberate light week must not look like a drop
 * in form). includeDeload=true brings deload back into the chain, on user
 * request -- by default a deload week disappears from comparisons entirely,
 * so the week AFTER a deload is compared to the last non-deload week BEFORE
 * it, not to the deload itself (otherwise returning to normal would look like
 * a false jump in form).
 */
public final class TrendComparator {

    private TrendComparator() {
    }

    public record WeeklyValue(IsoWeek week, BigDecimal value, boolean isDeload) {
    }

    public record TrendResult(BigDecimal previousValue, BigDecimal currentValue, BigDecimal deltaPercent) {
    }

    public static Optional<TrendResult> compareToPreviousWeek(
            List<WeeklyValue> chronologicalWeeks, IsoWeek targetWeek, boolean includeDeload) {

        List<WeeklyValue> relevant = includeDeload
                ? chronologicalWeeks
                : chronologicalWeeks.stream().filter(w -> !w.isDeload()).toList();

        int targetIndex = -1;
        for (int i = 0; i < relevant.size(); i++) {
            if (relevant.get(i).week().equals(targetWeek)) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex <= 0) {
            return Optional.empty();
        }

        BigDecimal previous = relevant.get(targetIndex - 1).value();
        BigDecimal current = relevant.get(targetIndex).value();
        if (previous.compareTo(BigDecimal.ZERO) == 0) {
            return Optional.empty();
        }

        BigDecimal deltaPercent = current.subtract(previous)
                .divide(previous, 6, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);

        return Optional.of(new TrendResult(previous, current, deltaPercent));
    }

}
