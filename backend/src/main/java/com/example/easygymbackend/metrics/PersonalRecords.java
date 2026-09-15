package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public record PersonalRecords(
        Optional<PersonalRecordEntry> maxWeight,
        Optional<PersonalRecordEntry> maxE1rm,
        Optional<SessionVolumeRecord> maxSessionVolume,
        Map<RepRangeBucket, PersonalRecordEntry> byRepRange
) {

    public static PersonalRecords empty() {
        return new PersonalRecords(
                Optional.empty(), Optional.empty(), Optional.empty(), new EnumMap<>(RepRangeBucket.class));
    }

    public record PersonalRecordEntry(UUID setId, BigDecimal value) {
    }

    public record SessionVolumeRecord(UUID workoutId, BigDecimal value) {
    }

}
