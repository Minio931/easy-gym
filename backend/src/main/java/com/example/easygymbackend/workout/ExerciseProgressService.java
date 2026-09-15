package com.example.easygymbackend.workout;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.metrics.ExerciseSet;
import com.example.easygymbackend.metrics.OneRepMax;
import com.example.easygymbackend.metrics.OneRepMaxFormula;
import com.example.easygymbackend.metrics.PersonalRecordCalculator;
import com.example.easygymbackend.metrics.PersonalRecords;
import com.example.easygymbackend.metrics.RepRangeBucket;
import com.example.easygymbackend.metrics.SessionMetrics;
import com.example.easygymbackend.workout.dto.ExerciseProgressPoint;
import com.example.easygymbackend.workout.dto.ExerciseProgressResponse;
import com.example.easygymbackend.workout.dto.PersonalRecordEntryResponse;
import com.example.easygymbackend.workout.dto.PersonalRecordsResponse;
import com.example.easygymbackend.workout.dto.SessionVolumeRecordResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Wpina czyste funkcje z pakietu metrics (etap 3) w realne dane -- pierwszy
 * konsument tego pakietu poza testami. Jedno ćwiczenie, cała historia usera:
 * mały, ograniczony zbiór, więc pobranie wszystkich serii i policzenie w
 * Javie jest właściwym podejściem (w odróżnieniu od agregacji "cała historia
 * wszystkich ćwiczeń" na dashboardzie, etap 8, gdzie ma to być SUM/GROUP BY
 * w zapytaniu -- sekcja 9 promptu).
 */
@Service
public class ExerciseProgressService {

    private final ExerciseRepository exerciseRepository;
    private final WorkoutSetRepository workoutSetRepository;

    public ExerciseProgressService(ExerciseRepository exerciseRepository, WorkoutSetRepository workoutSetRepository) {
        this.exerciseRepository = exerciseRepository;
        this.workoutSetRepository = workoutSetRepository;
    }

    // @Transactional(readOnly=true) -- grupowanie po sesji nawiguje
    // s.getWorkoutExercise().getWorkout() (leniwe), patrz identyczna uwaga
    // przy WorkoutService.getDetail().
    @Transactional(readOnly = true)
    public ExerciseProgressResponse getProgress(UUID exerciseId, OneRepMaxFormula formula) {
        UUID userId = CurrentUser.id();
        Exercise exercise = exerciseRepository.findVisibleTo(exerciseId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Ćwiczenie nie istnieje"));

        List<WorkoutSet> rawSets = workoutSetRepository.findAllForExercise(exerciseId, userId);
        List<SessionGroup> sessions = groupIntoSessions(rawSets);

        List<ExerciseProgressPoint> points = sessions.stream()
                .map(session -> toProgressPoint(session, formula))
                .flatMap(Optional::stream)
                .toList();

        List<PersonalRecordCalculator.Session> prSessions = sessions.stream()
                .map(session -> new PersonalRecordCalculator.Session(session.workoutId(), toMetricsSets(session.rawSets())))
                .toList();
        PersonalRecords records = PersonalRecordCalculator.compute(prSessions, formula);

        return new ExerciseProgressResponse(exercise.getId(), exercise.getName(), points, toResponse(records));
    }

    private Optional<ExerciseProgressPoint> toProgressPoint(SessionGroup session, OneRepMaxFormula formula) {
        List<ExerciseSet> metricsSets = toMetricsSets(session.rawSets());
        Optional<ExerciseSet> heaviest = SessionMetrics.heaviestSet(metricsSets);
        if (heaviest.isEmpty()) {
            return Optional.empty();
        }

        ExerciseSet h = heaviest.get();
        WorkoutSet heaviestRaw = session.rawSets().stream()
                .filter(s -> s.getId().equals(h.setId()))
                .findFirst()
                .orElseThrow();

        BigDecimal e1rm = OneRepMax.estimate(h.weightKg(), h.reps(), formula).orElse(null);
        BigDecimal volume = SessionMetrics.displayVolumeKg(metricsSets);

        return Optional.of(new ExerciseProgressPoint(
                session.workoutId(), session.startedAt(), session.deload(),
                h.weightKg(), h.reps(), heaviestRaw.getRpe(), h.toFailure(), e1rm, volume));
    }

    private List<SessionGroup> groupIntoSessions(List<WorkoutSet> sets) {
        LinkedHashMap<UUID, SessionGroup> bySession = new LinkedHashMap<>();
        for (WorkoutSet s : sets) {
            Workout workout = s.getWorkoutExercise().getWorkout();
            SessionGroup group = bySession.computeIfAbsent(workout.getId(),
                    id -> new SessionGroup(id, workout.getStartedAt(), workout.isDeload(), new ArrayList<>()));
            group.rawSets().add(s);
        }
        return new ArrayList<>(bySession.values());
    }

    private static List<ExerciseSet> toMetricsSets(List<WorkoutSet> sets) {
        return sets.stream().map(ExerciseProgressService::toMetricsSet).toList();
    }

    private static ExerciseSet toMetricsSet(WorkoutSet s) {
        return new ExerciseSet(s.getId(), s.getCompletedAt(), s.getWeightKg(), s.getReps(), s.isWarmup(), s.isToFailure(), s.isAssisted());
    }

    private static PersonalRecordsResponse toResponse(PersonalRecords records) {
        Map<RepRangeBucket, PersonalRecordEntryResponse> byRepRange = new EnumMap<>(RepRangeBucket.class);
        records.byRepRange().forEach((bucket, entry) ->
                byRepRange.put(bucket, new PersonalRecordEntryResponse(entry.setId(), entry.value())));

        return new PersonalRecordsResponse(
                records.maxWeight().map(e -> new PersonalRecordEntryResponse(e.setId(), e.value())).orElse(null),
                records.maxE1rm().map(e -> new PersonalRecordEntryResponse(e.setId(), e.value())).orElse(null),
                records.maxSessionVolume().map(v -> new SessionVolumeRecordResponse(v.workoutId(), v.value())).orElse(null),
                byRepRange);
    }

    private record SessionGroup(UUID workoutId, Instant startedAt, boolean deload, List<WorkoutSet> rawSets) {
    }

}
