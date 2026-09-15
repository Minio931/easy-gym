package com.example.easygymbackend.workout;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.workout.dto.AddExerciseRequest;
import com.example.easygymbackend.workout.dto.StartWorkoutRequest;
import com.example.easygymbackend.workout.dto.UpdateWorkoutRequest;
import com.example.easygymbackend.workout.dto.WorkoutDetailResponse;
import com.example.easygymbackend.workout.dto.WorkoutExerciseResponse;
import com.example.easygymbackend.workout.dto.WorkoutSummaryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class WorkoutService {

    private final WorkoutRepository workoutRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;
    private final WorkoutSetRepository workoutSetRepository;
    private final ExerciseRepository exerciseRepository;

    public WorkoutService(
            WorkoutRepository workoutRepository,
            WorkoutExerciseRepository workoutExerciseRepository,
            WorkoutSetRepository workoutSetRepository,
            ExerciseRepository exerciseRepository
    ) {
        this.workoutRepository = workoutRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.workoutSetRepository = workoutSetRepository;
        this.exerciseRepository = exerciseRepository;
    }

    @Transactional
    public WorkoutSummaryResponse start(StartWorkoutRequest request) {
        Workout workout = new Workout();
        workout.setId(UUID.randomUUID());
        workout.setUserId(CurrentUser.id());
        workout.setStartedAt(Instant.now());
        workout.setRoutineId(request.routineId());
        workout.setNotes(request.notes());
        workout.setDeload(request.deload());

        workout = workoutRepository.save(workout);
        return WorkoutMapper.toSummary(workout);
    }

    /** endedAt ustawione = koniec treningu; pola null w request = bez zmian. */
    @Transactional
    public WorkoutSummaryResponse update(UUID workoutId, UpdateWorkoutRequest request) {
        Workout workout = requireOwnWorkout(workoutId);

        if (request.endedAt() != null) {
            workout.setEndedAt(request.endedAt());
        }
        if (request.notes() != null) {
            workout.setNotes(request.notes());
        }
        if (request.deload() != null) {
            workout.setDeload(request.deload());
        }

        // Bez jawnego save() -- encja managed w tej transakcji, dirty checking
        // Hibernate flushuje zmiany przy commicie.
        return WorkoutMapper.toSummary(workout);
    }

    // open-in-view=false (celowo, patrz application.yaml) -- bez tej adnotacji
    // sesja Hibernate zamyka się zaraz po requireOwnWorkout(), a leniwy
    // workoutExercise.getExercise() w mapperze wybucha LazyInitializationException.
    @Transactional(readOnly = true)
    public WorkoutDetailResponse getDetail(UUID workoutId) {
        UUID userId = CurrentUser.id();
        Workout workout = requireOwnWorkout(workoutId);

        List<WorkoutExerciseResponse> exercises = workoutExerciseRepository.findAllVisibleTo(workoutId, userId)
                .stream()
                .map(we -> toWorkoutExerciseResponse(we, userId))
                .toList();

        return WorkoutMapper.toDetail(workout, exercises);
    }

    public List<WorkoutSummaryResponse> list() {
        return workoutRepository.findAllVisibleTo(CurrentUser.id()).stream()
                .map(WorkoutMapper::toSummary)
                .toList();
    }

    @Transactional
    public WorkoutExerciseResponse addExercise(UUID workoutId, AddExerciseRequest request) {
        UUID userId = CurrentUser.id();
        Workout workout = requireOwnWorkout(workoutId);
        Exercise exercise = exerciseRepository.findVisibleTo(request.exerciseId(), userId)
                .orElseThrow(() -> new ResourceNotFoundException("Ćwiczenie nie istnieje"));

        WorkoutExercise workoutExercise = new WorkoutExercise();
        workoutExercise.setId(UUID.randomUUID());
        workoutExercise.setWorkout(workout);
        workoutExercise.setExercise(exercise);
        workoutExercise.setOrderIndex(request.orderIndex());
        workoutExercise.setNotes(request.notes());

        workoutExercise = workoutExerciseRepository.save(workoutExercise);
        return toWorkoutExerciseResponse(workoutExercise, userId);
    }

    private Workout requireOwnWorkout(UUID workoutId) {
        return workoutRepository.findVisibleTo(workoutId, CurrentUser.id())
                .orElseThrow(() -> new ResourceNotFoundException("Trening nie istnieje"));
    }

    private WorkoutExerciseResponse toWorkoutExerciseResponse(WorkoutExercise workoutExercise, UUID userId) {
        var sets = workoutSetRepository.findAllVisibleTo(workoutExercise.getId(), userId).stream()
                .map(WorkoutMapper::toResponse)
                .toList();
        return WorkoutMapper.toResponse(workoutExercise, sets);
    }

}
