package com.example.easygymbackend.exercise.dto;

import com.example.easygymbackend.metrics.PersonalRecords;
import com.example.easygymbackend.metrics.RepRangeBucket;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Aktualny stan rekordów dla jednego ćwiczenia. `null` = brak danych (np.
 * same serie rozgrzewkowe), nie zero. Klucze byRepRange to nazwy RepRangeBucket.
 */
public record PersonalRecordsResponse(
        Entry maxWeight,
        Entry maxE1rm,
        SessionVolume maxSessionVolume,
        Map<String, Entry> byRepRange
) {

    public record Entry(UUID setId, BigDecimal value) {
    }

    public record SessionVolume(UUID workoutId, BigDecimal value) {
    }

    public static PersonalRecordsResponse from(PersonalRecords records) {
        Map<String, Entry> byRepRange = new LinkedHashMap<>();
        for (RepRangeBucket bucket : RepRangeBucket.values()) {
            PersonalRecords.PersonalRecordEntry entry = records.byRepRange().get(bucket);
            if (entry != null) {
                byRepRange.put(bucket.name(), new Entry(entry.setId(), entry.value()));
            }
        }
        return new PersonalRecordsResponse(
                records.maxWeight().map(e -> new Entry(e.setId(), e.value())).orElse(null),
                records.maxE1rm().map(e -> new Entry(e.setId(), e.value())).orElse(null),
                records.maxSessionVolume()
                        .map(v -> new SessionVolume(v.workoutId(), v.value())).orElse(null),
                byRepRange);
    }

}
