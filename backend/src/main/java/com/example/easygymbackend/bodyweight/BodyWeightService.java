package com.example.easygymbackend.bodyweight;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.bodyweight.dto.BodyWeightProgressResponse;
import com.example.easygymbackend.bodyweight.dto.BodyWeightResponse;
import com.example.easygymbackend.bodyweight.dto.CreateBodyWeightRequest;
import com.example.easygymbackend.bodyweight.dto.UpdateBodyWeightRequest;
import com.example.easygymbackend.bodyweight.dto.WeeklyAverageResponse;
import com.example.easygymbackend.metrics.BodyWeightAggregator;
import com.example.easygymbackend.metrics.BodyWeightEntry;
import com.example.easygymbackend.metrics.WeeklyBodyWeightAverage;
import com.example.easygymbackend.workout.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class BodyWeightService {

    private final BodyWeightRepository bodyWeightRepository;

    public BodyWeightService(BodyWeightRepository bodyWeightRepository) {
        this.bodyWeightRepository = bodyWeightRepository;
    }

    @Transactional
    public BodyWeightResponse create(CreateBodyWeightRequest request) {
        BodyWeight entry = new BodyWeight();
        entry.setId(request.id());
        entry.setUserId(CurrentUser.id());
        entry.setMeasuredOn(request.measuredOn());
        entry.setWeightKg(request.weightKg());
        entry.setNote(request.note());

        entry = bodyWeightRepository.save(entry);
        return toResponse(entry);
    }

    @Transactional
    public BodyWeightResponse update(UUID id, UpdateBodyWeightRequest request) {
        BodyWeight entry = requireOwn(id);

        if (request.weightKg() != null) {
            entry.setWeightKg(request.weightKg());
        }
        if (request.note() != null) {
            entry.setNote(request.note());
        }

        return toResponse(entry);
    }

    @Transactional
    public void delete(UUID id) {
        requireOwn(id).setDeletedAt(Instant.now());
    }

    public BodyWeightProgressResponse getProgress() {
        UUID userId = CurrentUser.id();
        List<BodyWeight> entries = bodyWeightRepository.findAllVisibleTo(userId);

        List<BodyWeightEntry> metricsEntries = entries.stream()
                .map(e -> new BodyWeightEntry(e.getMeasuredOn(), e.getWeightKg()))
                .toList();

        List<WeeklyBodyWeightAverage> weeklyAverages = BodyWeightAggregator.weeklyAverages(metricsEntries);
        List<WeeklyAverageResponse> weeklyResponses = weeklyAverages.stream()
                .map(w -> new WeeklyAverageResponse(
                        w.week(),
                        w.measurementCount(),
                        w.averageKg(),
                        w.incomplete(),
                        BodyWeightAggregator.weekOverWeekDeltaKg(weeklyAverages, w.week()).orElse(null),
                        BodyWeightAggregator.weekOverWeekDeltaPercent(weeklyAverages, w.week()).orElse(null)))
                .toList();

        return new BodyWeightProgressResponse(
                entries.stream().map(BodyWeightService::toResponse).toList(),
                BodyWeightAggregator.sevenDayRollingAverage(metricsEntries),
                weeklyResponses);
    }

    private BodyWeight requireOwn(UUID id) {
        return bodyWeightRepository.findVisibleTo(id, CurrentUser.id())
                .orElseThrow(() -> new ResourceNotFoundException("Wpis wagi nie istnieje"));
    }

    private static BodyWeightResponse toResponse(BodyWeight entry) {
        return new BodyWeightResponse(
                entry.getId(), entry.getMeasuredOn(), entry.getWeightKg(), entry.getNote(), entry.getUpdatedAt());
    }

}
