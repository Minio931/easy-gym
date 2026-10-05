package com.example.easygymbackend.metrics;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;

/**
 * ISO-8601 week (Monday-Sunday) in Europe/Warsaw -- section 5 of the prompt
 * explicitly forbids computing this via native getDay() without correction.
 * java.time.temporal.IsoFields implements the ISO-8601 rule (week 1 =
 * the week containing the first Thursday of January) natively, so no manual
 * arithmetic on day offsets.
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

    /** Monday of this week. January 4th always lies in week 1 per ISO-8601. */
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
