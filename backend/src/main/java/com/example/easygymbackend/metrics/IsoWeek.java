package com.example.easygymbackend.metrics;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;

/**
 * Tydzień ISO-8601 (poniedziałek-niedziela) w strefie Europe/Warsaw -- sekcja
 * 5 promptu wprost zabrania liczenia tego przez natywny getDay() bez korekty.
 * java.time.temporal.IsoFields implementuje regułę ISO-8601 (tydzień 1 =
 * tydzień zawierający pierwszy czwartek stycznia) natywnie, więc zero ręcznej
 * arytmetyki na offsetach dni.
 */
public record IsoWeek(int year, int week) implements Comparable<IsoWeek> {

    public static final ZoneId WARSAW = ZoneId.of("Europe/Warsaw");

    public static IsoWeek of(LocalDate date) {
        return new IsoWeek(
                date.get(IsoFields.WEEK_BASED_YEAR),
                date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
    }

    public static IsoWeek ofInstant(Instant instant) {
        return of(instant.atZone(WARSAW).toLocalDate());
    }

    /** Poniedziałek tego tygodnia. 4 stycznia zawsze leży w tygodniu 1 wg ISO-8601. */
    public LocalDate mondayStart() {
        return LocalDate.ofYearDay(year, 4)
                .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                .plusWeeks(week - 1L);
    }

    public LocalDate sundayEnd() {
        return mondayStart().plusDays(6);
    }

    @Override
    public int compareTo(IsoWeek other) {
        int yearCompare = Integer.compare(year, other.year);
        return yearCompare != 0 ? yearCompare : Integer.compare(week, other.week);
    }

}
