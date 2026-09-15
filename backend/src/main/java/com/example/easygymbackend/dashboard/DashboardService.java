package com.example.easygymbackend.dashboard;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.dashboard.dto.DashboardResponse;
import com.example.easygymbackend.dashboard.dto.RecentPersonalRecord;
import com.example.easygymbackend.metrics.OneRepMaxFormula;
import com.example.easygymbackend.metrics.PersonalRecordCalculator;
import com.example.easygymbackend.metrics.PersonalRecords;
import com.example.easygymbackend.workout.MetricsConversion;
import com.example.easygymbackend.workout.WorkoutSessionGroup;
import com.example.easygymbackend.workout.WorkoutSessionGrouper;
import com.example.easygymbackend.workout.WorkoutSet;
import com.example.easygymbackend.workout.WorkoutSetRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class DashboardService {

    private static final int RECENT_PR_WINDOW_DAYS = 30;

    private final DashboardRepository dashboardRepository;
    private final WorkoutSetRepository workoutSetRepository;

    public DashboardService(DashboardRepository dashboardRepository, WorkoutSetRepository workoutSetRepository) {
        this.dashboardRepository = dashboardRepository;
        this.workoutSetRepository = workoutSetRepository;
    }

    // @Transactional(readOnly=true) -- grupowanie po ćwiczeniu/sesji nawiguje
    // leniwe relacje (workoutExercise.exercise/.workout), patrz identyczna
    // uwaga przy ExerciseProgressService.
    @Transactional(readOnly = true)
    public DashboardResponse getDashboard(LocalDate from, OneRepMaxFormula formula) {
        UUID userId = CurrentUser.id();

        return new DashboardResponse(
                dashboardRepository.weeklyVolumeByMuscleGroup(userId, from),
                dashboardRepository.workoutsByDay(userId, from),
                recentPersonalRecords(userId, formula));
    }

    private List<RecentPersonalRecord> recentPersonalRecords(UUID userId, OneRepMaxFormula formula) {
        List<WorkoutSet> allSets = workoutSetRepository.findAllForUser(userId);
        Instant recentThreshold = Instant.now().minus(RECENT_PR_WINDOW_DAYS, ChronoUnit.DAYS);

        Map<UUID, List<WorkoutSet>> byExercise = new LinkedHashMap<>();
        for (WorkoutSet s : allSets) {
            byExercise.computeIfAbsent(s.getWorkoutExercise().getExercise().getId(), id -> new ArrayList<>()).add(s);
        }

        List<RecentPersonalRecord> result = new ArrayList<>();
        for (Map.Entry<UUID, List<WorkoutSet>> entry : byExercise.entrySet()) {
            List<WorkoutSet> exerciseSets = entry.getValue();
            String exerciseName = exerciseSets.get(0).getWorkoutExercise().getExercise().getName();

            List<WorkoutSessionGroup> sessions = WorkoutSessionGrouper.groupByWorkout(exerciseSets);
            List<PersonalRecordCalculator.Session> prSessions = sessions.stream()
                    .map(s -> new PersonalRecordCalculator.Session(s.workoutId(), MetricsConversion.toMetricsSets(s.rawSets())))
                    .toList();
            PersonalRecords records = PersonalRecordCalculator.compute(prSessions, formula);

            Map<UUID, Instant> completedAtBySetId = new LinkedHashMap<>();
            for (WorkoutSet s : exerciseSets) {
                completedAtBySetId.put(s.getId(), s.getCompletedAt());
            }
            Map<UUID, Instant> startedAtByWorkoutId = new LinkedHashMap<>();
            for (WorkoutSessionGroup session : sessions) {
                startedAtByWorkoutId.put(session.workoutId(), session.startedAt());
            }

            records.maxWeight().ifPresent(e -> addIfRecent(result, entry.getKey(), exerciseName, "MAX_WEIGHT",
                    e.value(), completedAtBySetId.get(e.setId()), recentThreshold));
            records.maxE1rm().ifPresent(e -> addIfRecent(result, entry.getKey(), exerciseName, "MAX_E1RM",
                    e.value(), completedAtBySetId.get(e.setId()), recentThreshold));
            records.maxSessionVolume().ifPresent(v -> addIfRecent(result, entry.getKey(), exerciseName, "MAX_SESSION_VOLUME",
                    v.value(), startedAtByWorkoutId.get(v.workoutId()), recentThreshold));
        }

        return result.stream()
                .sorted((a, b) -> b.achievedAt().compareTo(a.achievedAt()))
                .toList();
    }

    private static void addIfRecent(
            List<RecentPersonalRecord> result, UUID exerciseId, String exerciseName, String category,
            BigDecimal value, Instant achievedAt, Instant threshold
    ) {
        if (achievedAt != null && achievedAt.isAfter(threshold)) {
            result.add(new RecentPersonalRecord(exerciseId, exerciseName, category, value, achievedAt));
        }
    }

}
