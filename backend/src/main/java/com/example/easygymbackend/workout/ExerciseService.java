package com.example.easygymbackend.workout;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.workout.dto.CreateExerciseRequest;
import com.example.easygymbackend.workout.dto.ExerciseResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class ExerciseService {

    private final ExerciseRepository exerciseRepository;

    public ExerciseService(ExerciseRepository exerciseRepository) {
        this.exerciseRepository = exerciseRepository;
    }

    /** Globalne + własne usera (sekcja 3.2: wyszukiwarka + "ostatnio używane" robi front z tej listy). */
    public List<ExerciseResponse> search(String rawSearch) {
        UUID userId = CurrentUser.id();
        String search = (rawSearch == null || rawSearch.isBlank()) ? null : rawSearch.trim();
        return exerciseRepository.findVisibleTo(userId, search).stream()
                .map(WorkoutMapper::toResponse)
                .toList();
    }

    @Transactional
    public ExerciseResponse create(CreateExerciseRequest request) {
        UUID userId = CurrentUser.id();

        Exercise exercise = new Exercise();
        exercise.setId(request.id());
        exercise.setUserId(userId);
        exercise.setName(request.name());
        exercise.setMuscleGroup(request.muscleGroup());
        exercise.setEquipment(request.equipment());

        exercise = exerciseRepository.save(exercise);
        return WorkoutMapper.toResponse(exercise);
    }

}
