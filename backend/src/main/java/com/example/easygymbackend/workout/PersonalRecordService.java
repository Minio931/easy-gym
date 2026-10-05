package com.example.easygymbackend.workout;

import com.example.easygymbackend.exercise.Exercise;
import com.example.easygymbackend.exercise.ExerciseRepository;
import com.example.easygymbackend.metrics.ExerciseSet;
import com.example.easygymbackend.metrics.MetricsMapper;
import com.example.easygymbackend.metrics.OneRepMaxFormula;
import com.example.easygymbackend.metrics.PersonalRecordCalculator;
import com.example.easygymbackend.metrics.PersonalRecords;
import com.example.easygymbackend.metrics.RepRangeBucket;
import com.example.easygymbackend.workout.dto.PersonalRecordResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Entry point into PersonalRecordCalculator over real data. Sessions are
 * loaded in a single query per exercise and only up to and including the
 * inspected session -- "PR broken in this session" is the record AT THE
 * MOMENT of execution, so later workouts cannot invalidate it.
 */
@Service
public class PersonalRecordService {

    private final WorkoutRepository workoutRepository;
    private final ExerciseRepository exerciseRepository;

    public PersonalRecordService(WorkoutRepository workoutRepository, ExerciseRepository exerciseRepository) {
        this.workoutRepository = workoutRepository;
        this.exerciseRepository = exerciseRepository;
    }

    @Transactional(readOnly = true)
    public List<PersonalRecordCalculator.Session> sessions(
            UUID userId, UUID exerciseId, Instant from, Instant to) {
        Map<UUID, List<ExerciseSet>> byWorkout = new LinkedHashMap<>();
        for (Object[] row : workoutRepository.findSessionSetsForExercise(userId, exerciseId, from, to)) {
            Workout workout = (Workout) row[0];
            WorkoutSet set = (WorkoutSet) row[1];
            byWorkout.computeIfAbsent(workout.getId(), id -> new ArrayList<>())
                    .add(MetricsMapper.toExerciseSet(set));
        }
        return byWorkout.entrySet().stream()
                .map(entry -> new PersonalRecordCalculator.Session(entry.getKey(), entry.getValue()))
                .toList();
    }

    /** Records broken by the given workout, per exercise performed in it. */
    @Transactional(readOnly = true)
    public List<PersonalRecordResponse> brokenIn(
            UUID userId, Workout workout, List<UUID> exerciseIds, OneRepMaxFormula formula) {
        if (exerciseIds.isEmpty()) {
            return List.of();
        }
        Map<UUID, String> names = exerciseNames(exerciseIds);
        List<PersonalRecordResponse> result = new ArrayList<>();

        for (UUID exerciseId : exerciseIds) {
            // +1 ms, because the upper query bound is exclusive and the inspected
            // session must remain the last element of the chronological list.
            List<PersonalRecordCalculator.Session> sessions =
                    sessions(userId, exerciseId, Instant.EPOCH, workout.getStartedAt().plusMillis(1));
            if (sessions.isEmpty()
                    || !sessions.get(sessions.size() - 1).workoutId().equals(workout.getId())) {
                continue;
            }
            PersonalRecords broken = PersonalRecordCalculator.brokenIn(sessions, formula);
            String name = names.getOrDefault(exerciseId, "");

            broken.maxWeight().ifPresent(entry -> result.add(new PersonalRecordResponse(
                    exerciseId, name, "WEIGHT", null, entry.value(), entry.setId(), workout.getId())));
            broken.maxE1rm().ifPresent(entry -> result.add(new PersonalRecordResponse(
                    exerciseId, name, "E1RM", null, entry.value(), entry.setId(), workout.getId())));
            broken.maxSessionVolume().ifPresent(record -> result.add(new PersonalRecordResponse(
                    exerciseId, name, "SESSION_VOLUME", null, record.value(), null, record.workoutId())));
            for (Map.Entry<RepRangeBucket, PersonalRecords.PersonalRecordEntry> entry
                    : broken.byRepRange().entrySet()) {
                result.add(new PersonalRecordResponse(
                        exerciseId, name, "REP_RANGE", entry.getKey().name(),
                        entry.getValue().value(), entry.getValue().setId(), workout.getId()));
            }
        }
        return result;
    }

    @Transactional(readOnly = true)
    public Map<UUID, String> exerciseNames(List<UUID> exerciseIds) {
        Map<UUID, String> names = new LinkedHashMap<>();
        for (Exercise exercise : exerciseRepository.findAllById(exerciseIds)) {
            names.put(exercise.getId(), exercise.getName());
        }
        return names;
    }

}
