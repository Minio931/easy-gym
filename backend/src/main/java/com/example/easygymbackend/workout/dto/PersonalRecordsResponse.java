package com.example.easygymbackend.workout.dto;

import com.example.easygymbackend.metrics.RepRangeBucket;

import java.util.Map;

public record PersonalRecordsResponse(
        PersonalRecordEntryResponse maxWeight,
        PersonalRecordEntryResponse maxE1rm,
        SessionVolumeRecordResponse maxSessionVolume,
        Map<RepRangeBucket, PersonalRecordEntryResponse> byRepRange
) {
}
