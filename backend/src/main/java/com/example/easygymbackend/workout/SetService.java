package com.example.easygymbackend.workout;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.workout.dto.AddSetRequest;
import com.example.easygymbackend.workout.dto.SetResponse;
import com.example.easygymbackend.workout.dto.UpdateSetRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
public class SetService {

    private final WorkoutExerciseRepository workoutExerciseRepository;
    private final WorkoutSetRepository workoutSetRepository;

    public SetService(WorkoutExerciseRepository workoutExerciseRepository, WorkoutSetRepository workoutSetRepository) {
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.workoutSetRepository = workoutSetRepository;
    }

    @Transactional
    public SetResponse add(UUID workoutExerciseId, AddSetRequest request) {
        WorkoutExercise workoutExercise = workoutExerciseRepository
                .findVisibleTo(workoutExerciseId, CurrentUser.id())
                .orElseThrow(() -> new ResourceNotFoundException("Ćwiczenie w treningu nie istnieje"));

        WorkoutSet set = new WorkoutSet();
        set.setId(UUID.randomUUID());
        set.setWorkoutExercise(workoutExercise);
        set.setSetIndex(request.setIndex());
        set.setWeightKg(request.weightKg());
        set.setReps(request.reps());
        set.setRpe(request.rpe());
        set.setWarmup(request.warmup());
        set.setToFailure(request.toFailure());
        set.setAssisted(request.assisted());
        set.setCompletedAt(request.completedAt() != null ? request.completedAt() : Instant.now());

        set = workoutSetRepository.save(set);
        return WorkoutMapper.toResponse(set);
    }

    /** Pole null w request = bez zmian (patrz UpdateSetRequest -- rpe nie da się w ten sposób wyczyścić). */
    @Transactional
    public SetResponse update(UUID setId, UpdateSetRequest request) {
        WorkoutSet set = requireOwnSet(setId);

        if (request.setIndex() != null) {
            set.setSetIndex(request.setIndex());
        }
        if (request.weightKg() != null) {
            set.setWeightKg(request.weightKg());
        }
        if (request.reps() != null) {
            set.setReps(request.reps());
        }
        if (request.rpe() != null) {
            set.setRpe(request.rpe());
        }
        if (request.warmup() != null) {
            set.setWarmup(request.warmup());
        }
        if (request.toFailure() != null) {
            set.setToFailure(request.toFailure());
        }
        if (request.assisted() != null) {
            set.setAssisted(request.assisted());
        }

        return WorkoutMapper.toResponse(set);
    }

    @Transactional
    public void delete(UUID setId) {
        requireOwnSet(setId).setDeletedAt(Instant.now());
    }

    private WorkoutSet requireOwnSet(UUID setId) {
        return workoutSetRepository.findVisibleTo(setId, CurrentUser.id())
                .orElseThrow(() -> new ResourceNotFoundException("Seria nie istnieje"));
    }

}
