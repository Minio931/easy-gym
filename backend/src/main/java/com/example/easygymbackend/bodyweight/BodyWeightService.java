package com.example.easygymbackend.bodyweight;

import com.example.easygymbackend.bodyweight.dto.BodyWeightResponse;
import com.example.easygymbackend.bodyweight.dto.BodyWeightStatsResponse;
import com.example.easygymbackend.bodyweight.dto.SaveBodyWeightRequest;
import com.example.easygymbackend.bodyweight.dto.WeeklyBodyWeightResponse;
import com.example.easygymbackend.common.NotFoundException;
import com.example.easygymbackend.metrics.BodyWeightAggregator;
import com.example.easygymbackend.metrics.BodyWeightEntry;
import com.example.easygymbackend.metrics.IsoWeek;
import com.example.easygymbackend.metrics.WeeklyBodyWeightAverage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class BodyWeightService {

    /** Tyle tygodni wstecz sięga porównanie "trend 4-tygodniowy" (sekcja 5). */
    private static final int TREND_WEEKS_BACK = 4;

    private final BodyWeightRepository bodyWeightRepository;
    private final Clock clock;

    public BodyWeightService(BodyWeightRepository bodyWeightRepository, Clock clock) {
        this.bodyWeightRepository = bodyWeightRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<BodyWeightResponse> list(UUID userId, LocalDate from, LocalDate to) {
        return entries(userId, from, to).stream().map(BodyWeightResponse::from).toList();
    }

    /**
     * Upsert po dacie pomiaru. Rekord z tym samym dniem jest edytowany, nawet
     * jeśli klient przysłał inne id -- inaczej częściowy indeks unikalny z V3
     * odrzuciłby insert jako konflikt, a user zobaczyłby 409 przy zwykłej
     * poprawce wagi.
     */
    @Transactional
    public BodyWeightResponse save(UUID userId, SaveBodyWeightRequest request) {
        Instant now = clock.instant();
        BodyWeight entry = bodyWeightRepository
                .findByUserIdAndMeasuredOnAndDeletedAtIsNull(userId, request.measuredOn())
                .orElseGet(() -> {
                    BodyWeight created = new BodyWeight();
                    created.setId(request.id() != null ? request.id() : UUID.randomUUID());
                    created.setUserId(userId);
                    created.setMeasuredOn(request.measuredOn());
                    return created;
                });

        entry.setWeightKg(request.weightKg());
        entry.setNote(request.note());
        entry.setUpdatedAt(now);
        entry.setDeletedAt(null);

        return BodyWeightResponse.from(bodyWeightRepository.save(entry));
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        BodyWeight entry = bodyWeightRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new NotFoundException("Wpis wagi nie istnieje: " + id));
        Instant now = clock.instant();
        entry.setDeletedAt(now);
        entry.setUpdatedAt(now);
        bodyWeightRepository.save(entry);
    }

    @Transactional(readOnly = true)
    public BodyWeightStatsResponse stats(UUID userId, LocalDate from, LocalDate to) {
        List<BodyWeight> entities = entries(userId, from, to);
        List<BodyWeightEntry> metricEntries = entities.stream()
                .map(entry -> new BodyWeightEntry(entry.getMeasuredOn(), entry.getWeightKg()))
                .toList();

        List<WeeklyBodyWeightAverage> weekly = BodyWeightAggregator.weeklyAverages(metricEntries);
        List<WeeklyBodyWeightResponse> weeklyResponses = weekly.stream()
                .map(week -> new WeeklyBodyWeightResponse(
                        week.week().year(),
                        week.week().week(),
                        week.week().mondayStart(),
                        week.week().sundayEnd(),
                        week.measurementCount(),
                        week.averageKg(),
                        week.incomplete(),
                        BodyWeightAggregator.weekOverWeekDeltaKg(weekly, week.week()).orElse(null),
                        BodyWeightAggregator.weekOverWeekDeltaPercent(weekly, week.week()).orElse(null)))
                .toList();

        List<BodyWeightStatsResponse.RollingPoint> rolling =
                BodyWeightAggregator.sevenDayRollingAverage(metricEntries).entrySet().stream()
                        .map(entry -> new BodyWeightStatsResponse.RollingPoint(entry.getKey(), entry.getValue()))
                        .toList();

        BodyWeightResponse latest = entities.isEmpty()
                ? null
                : BodyWeightResponse.from(entities.get(entities.size() - 1));

        return new BodyWeightStatsResponse(
                entities.stream().map(BodyWeightResponse::from).toList(),
                weeklyResponses,
                rolling,
                latest,
                fourWeekTrend(weekly));
    }

    /**
     * Trend liczony po tygodniach Z POMIARAMI, nie po kalendarzu -- przerwa w
     * ważeniu ma dawać "porównanie do ostatniego znanego tygodnia", a nie dziurę.
     */
    private static BodyWeightStatsResponse.Trend fourWeekTrend(List<WeeklyBodyWeightAverage> weekly) {
        if (weekly.size() <= TREND_WEEKS_BACK) {
            return null;
        }
        WeeklyBodyWeightAverage current = weekly.get(weekly.size() - 1);
        WeeklyBodyWeightAverage past = weekly.get(weekly.size() - 1 - TREND_WEEKS_BACK);
        BigDecimal deltaKg = current.averageKg().subtract(past.averageKg()).setScale(2, RoundingMode.HALF_UP);
        BigDecimal deltaPercent = past.averageKg().compareTo(BigDecimal.ZERO) == 0
                ? null
                : deltaKg.divide(past.averageKg(), 6, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                        .setScale(2, RoundingMode.HALF_UP);

        return new BodyWeightStatsResponse.Trend(
                past.week().year(), past.week().week(),
                current.week().year(), current.week().week(),
                past.averageKg(), current.averageKg(), deltaKg, deltaPercent);
    }

    /** Ostatnie tygodnie do dashboardu -- ten sam podział ISO co w stats(). */
    @Transactional(readOnly = true)
    public Map<IsoWeek, WeeklyBodyWeightAverage> weeklyAverages(UUID userId, LocalDate from, LocalDate to) {
        List<BodyWeightEntry> metricEntries = entries(userId, from, to).stream()
                .map(entry -> new BodyWeightEntry(entry.getMeasuredOn(), entry.getWeightKg()))
                .toList();
        return BodyWeightAggregator.weeklyAverages(metricEntries).stream()
                .collect(java.util.stream.Collectors.toMap(WeeklyBodyWeightAverage::week, week -> week));
    }

    private List<BodyWeight> entries(UUID userId, LocalDate from, LocalDate to) {
        LocalDate rangeFrom = from != null ? from : LocalDate.of(1970, 1, 1);
        LocalDate rangeTo = to != null ? to : LocalDate.now(IsoWeek.WARSAW).plusDays(1);
        return bodyWeightRepository
                .findByUserIdAndDeletedAtIsNullAndMeasuredOnBetweenOrderByMeasuredOnAsc(userId, rangeFrom, rangeTo);
    }

}
