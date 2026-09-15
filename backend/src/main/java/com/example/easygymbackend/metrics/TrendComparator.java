package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Optional;

/**
 * Porównanie tydzień-do-tygodnia z domyślnym pomijaniem tygodni/sesji deload
 * (sekcja 4 promptu: celowy lekki tydzień nie może wyglądać jak spadek
 * formy). includeDeload=true włącza deload z powrotem do łańcucha, na
 * życzenie usera -- domyślnie tydzień deload znika z porównań całkowicie,
 * więc tydzień PO deloadzie porównywany jest do ostatniego tygodnia
 * nie-deload PRZED nim, a nie do samego deloadu (inaczej powrót do normy
 * wyglądałby jak fałszywy skok formy).
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
