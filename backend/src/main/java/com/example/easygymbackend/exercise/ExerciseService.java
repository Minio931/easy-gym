package com.example.easygymbackend.exercise;

import com.example.easygymbackend.common.ForbiddenOperationException;
import com.example.easygymbackend.common.NotFoundException;
import com.example.easygymbackend.exercise.dto.ExerciseResponse;
import com.example.easygymbackend.exercise.dto.SaveExerciseRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class ExerciseService {

    private final ExerciseRepository exerciseRepository;
    private final Clock clock;

    public ExerciseService(ExerciseRepository exerciseRepository, Clock clock) {
        this.exerciseRepository = exerciseRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ExerciseResponse> list(UUID userId, String query, boolean includeArchived) {
        List<Exercise> found = (query == null || query.isBlank())
                ? exerciseRepository.findVisible(userId)
                : exerciseRepository.searchVisible(userId, escapeLikeWildcards(query.trim()));

        return found.stream()
                .filter(exercise -> includeArchived || !exercise.isArchived())
                .map(ExerciseResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ExerciseResponse get(UUID userId, UUID id) {
        return ExerciseResponse.from(loadVisible(userId, id));
    }

    @Transactional
    public ExerciseResponse create(UUID userId, SaveExerciseRequest request) {
        Instant now = clock.instant();
        Exercise exercise = new Exercise();
        exercise.setId(request.id() != null ? request.id() : UUID.randomUUID());
        exercise.setUserId(userId);
        exercise.setName(request.name().trim());
        exercise.setMuscleGroup(request.muscleGroup().trim());
        exercise.setEquipment(Equipment.validated(request.equipment()));
        exercise.setArchived(Boolean.TRUE.equals(request.isArchived()));
        exercise.setCreatedAt(now);
        exercise.setUpdatedAt(now);

        return ExerciseResponse.from(exerciseRepository.save(exercise));
    }

    @Transactional
    public ExerciseResponse update(UUID userId, UUID id, SaveExerciseRequest request) {
        Exercise exercise = loadOwnEditable(userId, id);
        exercise.setName(request.name().trim());
        exercise.setMuscleGroup(request.muscleGroup().trim());
        exercise.setEquipment(Equipment.validated(request.equipment()));
        if (request.isArchived() != null) {
            exercise.setArchived(request.isArchived());
        }
        exercise.setUpdatedAt(clock.instant());

        return ExerciseResponse.from(exerciseRepository.save(exercise));
    }

    /** Soft delete -- inaczej skasowanie nie zsynchronizowałoby się na drugie urządzenie. */
    @Transactional
    public void delete(UUID userId, UUID id) {
        Exercise exercise = loadOwnEditable(userId, id);
        Instant now = clock.instant();
        exercise.setDeletedAt(now);
        exercise.setUpdatedAt(now);
        exerciseRepository.save(exercise);
    }

    private Exercise loadVisible(UUID userId, UUID id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("Ćwiczenie nie istnieje: " + id));
        if (!exercise.isGlobal() && !exercise.getUserId().equals(userId)) {
            // 404, nie 403 -- nie zdradzamy, że ten UUID istnieje na innym koncie.
            throw new NotFoundException("Ćwiczenie nie istnieje: " + id);
        }
        return exercise;
    }

    private Exercise loadOwnEditable(UUID userId, UUID id) {
        Exercise exercise = loadVisible(userId, id);
        if (exercise.isGlobal()) {
            throw new ForbiddenOperationException(
                    "Ćwiczenie z katalogu globalnego jest tylko do odczytu -- dodaj własne");
        }
        return exercise;
    }

    /** W ILIKE '%' || :query || '%' znaki % i _ z inputu usera byłyby wildcardami. */
    private static String escapeLikeWildcards(String query) {
        return query.replace("%", "").replace("_", " ");
    }

}
