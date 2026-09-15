package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;

public final class BodyWeightAggregator {

    private BodyWeightAggregator() {
    }

    public static List<WeeklyBodyWeightAverage> weeklyAverages(List<BodyWeightEntry> entries) {
        Map<IsoWeek, List<BodyWeightEntry>> byWeek = entries.stream()
                .collect(Collectors.groupingBy(e -> IsoWeek.of(e.measuredOn())));

        return byWeek.entrySet().stream()
                .map(entry -> {
                    List<BodyWeightEntry> weekEntries = entry.getValue();
                    BigDecimal average = weekEntries.stream()
                            .map(BodyWeightEntry::weightKg)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                            .divide(BigDecimal.valueOf(weekEntries.size()), 2, RoundingMode.HALF_UP);
                    return new WeeklyBodyWeightAverage(
                            entry.getKey(), weekEntries.size(), average, weekEntries.size() < 2);
                })
                .sorted(Comparator.comparing(WeeklyBodyWeightAverage::week))
                .toList();
    }

    public static Optional<BigDecimal> weekOverWeekDeltaKg(List<WeeklyBodyWeightAverage> chronologicalWeeks, IsoWeek targetWeek) {
        int index = indexOf(chronologicalWeeks, targetWeek);
        if (index <= 0) {
            return Optional.empty();
        }
        BigDecimal current = chronologicalWeeks.get(index).averageKg();
        BigDecimal previous = chronologicalWeeks.get(index - 1).averageKg();
        return Optional.of(current.subtract(previous).setScale(2, RoundingMode.HALF_UP));
    }

    public static Optional<BigDecimal> weekOverWeekDeltaPercent(List<WeeklyBodyWeightAverage> chronologicalWeeks, IsoWeek targetWeek) {
        int index = indexOf(chronologicalWeeks, targetWeek);
        if (index <= 0) {
            return Optional.empty();
        }
        BigDecimal current = chronologicalWeeks.get(index).averageKg();
        BigDecimal previous = chronologicalWeeks.get(index - 1).averageKg();
        if (previous.compareTo(BigDecimal.ZERO) == 0) {
            return Optional.empty();
        }
        return Optional.of(current.subtract(previous)
                .divide(previous, 6, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP));
    }

    /**
     * Krocząca średnia 7-dniowa per dzień pomiaru -- osobna seria na wykresie
     * obok grubej linii średnich tygodniowych (sekcja 5 promptu).
     */
    public static Map<LocalDate, BigDecimal> sevenDayRollingAverage(List<BodyWeightEntry> entries) {
        Map<LocalDate, BigDecimal> byDate = entries.stream()
                .collect(Collectors.toMap(BodyWeightEntry::measuredOn, BodyWeightEntry::weightKg, (a, b) -> b));

        Map<LocalDate, BigDecimal> result = new TreeMap<>();
        for (LocalDate date : byDate.keySet()) {
            LocalDate windowStart = date.minusDays(6);
            List<BigDecimal> windowValues = byDate.entrySet().stream()
                    .filter(e -> !e.getKey().isBefore(windowStart) && !e.getKey().isAfter(date))
                    .map(Map.Entry::getValue)
                    .toList();
            BigDecimal average = windowValues.stream()
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .divide(BigDecimal.valueOf(windowValues.size()), 2, RoundingMode.HALF_UP);
            result.put(date, average);
        }
        return result;
    }

    private static int indexOf(List<WeeklyBodyWeightAverage> weeks, IsoWeek target) {
        for (int i = 0; i < weeks.size(); i++) {
            if (weeks.get(i).week().equals(target)) {
                return i;
            }
        }
        return -1;
    }

}
