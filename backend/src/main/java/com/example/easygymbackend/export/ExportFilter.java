package com.example.easygymbackend.export;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** exerciseIds null/puste = wszystkie. Sekcja 7 promptu: "zakres dat, wybrane ćwiczenia, tylko serie robocze". */
record ExportFilter(LocalDate from, LocalDate to, List<UUID> exerciseIds, boolean workingSetsOnly) {

    LocalDate effectiveFrom() {
        return from != null ? from : LocalDate.of(2000, 1, 1);
    }

    LocalDate effectiveTo() {
        return to != null ? to : LocalDate.now();
    }

    boolean matchesExercise(UUID exerciseId) {
        return exerciseIds == null || exerciseIds.isEmpty() || exerciseIds.contains(exerciseId);
    }

}
