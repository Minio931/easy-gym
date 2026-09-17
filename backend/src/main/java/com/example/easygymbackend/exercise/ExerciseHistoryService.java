package com.example.easygymbackend.exercise;

import com.example.easygymbackend.common.NotFoundException;
import com.example.easygymbackend.exercise.dto.ExerciseHistoryResponse;
import com.example.easygymbackend.exercise.dto.PersonalRecordsResponse;
import com.example.easygymbackend.metrics.ExerciseSet;
import com.example.easygymbackend.metrics.MetricsMapper;
import com.example.easygymbackend.metrics.OneRepMax;
import com.example.easygymbackend.metrics.OneRepMaxFormula;
import com.example.easygymbackend.metrics.PersonalRecordCalculator;
import com.example.easygymbackend.metrics.SessionMetrics;
import com.example.easygymbackend.workout.Workout;
import com.example.easygymbackend.workout.WorkoutRepository;
import com.example.easygymbackend.workout.WorkoutSet;
import com.example.easygymbackend.workout.dto.SetResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class ExerciseHistoryService {

    private final ExerciseRepository exerciseRepository;
    private final WorkoutRepository workoutRepository;

    public ExerciseHistoryService(ExerciseRepository exerciseRepository, WorkoutRepository workoutRepository) {
        this.exerciseRepository = exerciseRepository;
        this.workoutRepository = workoutRepository;
    }

    @Transactional(readOnly = true)
    public ExerciseHistoryResponse history(
            UUID userId, UUID exerciseId, Instant from, Instant to, int limit, OneRepMaxFormula formula) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedAtIsNull(exerciseId)
                .filter(found -> found.isGlobal() || found.getUserId().equals(userId))
                .orElseThrow(() -> new NotFoundException("Ćwiczenie nie istnieje: " + exerciseId));

        Map<UUID, WorkoutSession> sessions = new LinkedHashMap<>();
        for (Object[] row : workoutRepository.findSessionSetsForExercise(userId, exerciseId, from, to)) {
            Workout workout = (Workout) row[0];
            WorkoutSet set = (WorkoutSet) row[1];
            sessions.computeIfAbsent(workout.getId(), id -> new WorkoutSession(workout, new ArrayList<>()))
                    .sets().add(set);
        }

        // Limit obcina NAJSTARSZE sesje -- wykres i PR mają pokazywać ostatnie N
        // treningów, ale nadal chronologicznie (PR liczy się narastająco).
        List<WorkoutSession> chronological = new ArrayList<>(sessions.values());
        if (chronological.size() > limit) {
            chronological = chronological.subList(chronological.size() - limit, chronological.size());
        }

        List<ExerciseHistoryResponse.Session> sessionResponses = new ArrayList<>();
        List<PersonalRecordCalculator.Session> metricSessions = new ArrayList<>();
        for (WorkoutSession session : chronological) {
            List<ExerciseSet> metricSets = session.sets().stream().map(MetricsMapper::toExerciseSet).toList();
            metricSessions.add(new PersonalRecordCalculator.Session(session.workout().getId(), metricSets));

            Optional<WorkoutSet> heaviest = SessionMetrics.heaviestSet(metricSets)
                    .flatMap(best -> session.sets().stream()
                            .filter(set -> set.getId().equals(best.setId()))
                            .findFirst());

            sessionResponses.add(new ExerciseHistoryResponse.Session(
                    session.workout().getId(),
                    session.workout().getStartedAt(),
                    session.workout().isDeload(),
                    session.sets().stream().map(set -> SetResponse.from(set, formula)).toList(),
                    SessionMetrics.displayVolumeKg(metricSets),
                    SessionMetrics.prEligibleVolumeKg(metricSets),
                    heaviest.map(set -> SetResponse.from(set, formula)).orElse(null),
                    bestE1rm(session.sets(), formula)));
        }

        return new ExerciseHistoryResponse(
                exercise.getId(),
                exercise.getName(),
                exercise.getMuscleGroup(),
                exercise.getEquipment(),
                sessionResponses,
                PersonalRecordsResponse.from(PersonalRecordCalculator.compute(metricSessions, formula)));
    }

    /** null (nie zero), jeśli żadna seria robocza nie daje sensownego e1RM. */
    private static BigDecimal bestE1rm(List<WorkoutSet> sets, OneRepMaxFormula formula) {
        return sets.stream()
                .filter(set -> !set.isWarmup() && !set.isAssisted())
                .map(set -> OneRepMax.estimate(set.getWeightKg(), set.getReps(), formula))
                .filter(Optional::isPresent)
                .map(Optional::get)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    private record WorkoutSession(Workout workout, List<WorkoutSet> sets) {
    }

}
