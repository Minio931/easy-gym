package com.example.easygymbackend.workout;

import com.example.easygymbackend.common.InvalidRequestException;
import com.example.easygymbackend.common.NotFoundException;
import com.example.easygymbackend.exercise.Exercise;
import com.example.easygymbackend.exercise.ExerciseRepository;
import com.example.easygymbackend.metrics.ExerciseSet;
import com.example.easygymbackend.metrics.MetricsMapper;
import com.example.easygymbackend.metrics.OneRepMaxFormula;
import com.example.easygymbackend.metrics.SessionMetrics;
import com.example.easygymbackend.routine.RoutineItem;
import com.example.easygymbackend.routine.RoutineItemRepository;
import com.example.easygymbackend.routine.RoutineRepository;
import com.example.easygymbackend.workout.dto.SaveSetRequest;
import com.example.easygymbackend.workout.dto.SaveWorkoutExerciseRequest;
import com.example.easygymbackend.workout.dto.SaveWorkoutRequest;
import com.example.easygymbackend.workout.dto.SetResponse;
import com.example.easygymbackend.workout.dto.WorkoutDetailResponse;
import com.example.easygymbackend.workout.dto.WorkoutExerciseResponse;
import com.example.easygymbackend.workout.dto.WorkoutListResponse;
import com.example.easygymbackend.workout.dto.WorkoutSummaryResponse;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class WorkoutService {

    private final WorkoutRepository workoutRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;
    private final WorkoutSetRepository setRepository;
    private final ExerciseRepository exerciseRepository;
    private final RoutineRepository routineRepository;
    private final RoutineItemRepository routineItemRepository;
    private final PersonalRecordService personalRecordService;
    private final Clock clock;

    public WorkoutService(
            WorkoutRepository workoutRepository,
            WorkoutExerciseRepository workoutExerciseRepository,
            WorkoutSetRepository setRepository,
            ExerciseRepository exerciseRepository,
            RoutineRepository routineRepository,
            RoutineItemRepository routineItemRepository,
            PersonalRecordService personalRecordService,
            Clock clock
    ) {
        this.workoutRepository = workoutRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.setRepository = setRepository;
        this.exerciseRepository = exerciseRepository;
        this.routineRepository = routineRepository;
        this.routineItemRepository = routineItemRepository;
        this.personalRecordService = personalRecordService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public WorkoutListResponse list(UUID userId, Instant from, Instant to, int limit, int offset) {
        Instant rangeFrom = from != null ? from : Instant.EPOCH;
        Instant rangeTo = to != null ? to : clock.instant().plusSeconds(86_400);
        int page = offset / Math.max(limit, 1);

        List<WorkoutSummaryResponse> items = workoutRepository
                .findSummaries(userId, rangeFrom, rangeTo, PageRequest.of(page, limit))
                .stream()
                .map(WorkoutSummaryResponse::from)
                .toList();

        return new WorkoutListResponse(
                items, workoutRepository.countInRange(userId, rangeFrom, rangeTo), limit, page * limit);
    }

    @Transactional(readOnly = true)
    public WorkoutDetailResponse detail(UUID userId, UUID id, OneRepMaxFormula formula) {
        return toDetail(userId, loadOwn(userId, id), formula);
    }

    @Transactional(readOnly = true)
    public Optional<WorkoutDetailResponse> active(UUID userId, OneRepMaxFormula formula) {
        return workoutRepository
                .findFirstByUserIdAndDeletedAtIsNullAndEndedAtIsNullOrderByStartedAtDesc(userId)
                .map(workout -> toDetail(userId, workout, formula));
    }

    @Transactional
    public WorkoutDetailResponse create(UUID userId, SaveWorkoutRequest request, OneRepMaxFormula formula) {
        Instant now = clock.instant();
        Workout workout = new Workout();
        workout.setId(request.id() != null ? request.id() : UUID.randomUUID());
        workout.setUserId(userId);
        workout.setStartedAt(request.startedAt());
        workout.setEndedAt(request.endedAt());
        workout.setNotes(request.notes());
        workout.setDeload(Boolean.TRUE.equals(request.isDeload()));
        workout.setCreatedAt(now);
        workout.setUpdatedAt(now);

        if (request.routineId() != null) {
            routineRepository.findByIdAndUserIdAndDeletedAtIsNull(request.routineId(), userId)
                    .orElseThrow(() -> new InvalidRequestException(
                            "Szablon nie istnieje albo należy do innego konta: " + request.routineId()));
            workout.setRoutineId(request.routineId());
        }
        workoutRepository.save(workout);

        boolean applyRoutine = request.routineId() != null && !Boolean.FALSE.equals(request.applyRoutine());
        if (applyRoutine) {
            copyRoutineItems(request.routineId(), workout.getId(), now);
        }

        return toDetail(userId, workout, formula);
    }

    @Transactional
    public WorkoutDetailResponse update(
            UUID userId, UUID id, SaveWorkoutRequest request, OneRepMaxFormula formula) {
        Workout workout = loadOwn(userId, id);
        workout.setStartedAt(request.startedAt());
        workout.setEndedAt(request.endedAt());
        workout.setNotes(request.notes());
        if (request.isDeload() != null) {
            workout.setDeload(request.isDeload());
        }
        workout.setUpdatedAt(clock.instant());
        workoutRepository.save(workout);

        return toDetail(userId, workout, formula);
    }

    /** "Zakończ trening" -- osobny endpoint, żeby front nie musiał odsyłać całego obiektu. */
    @Transactional
    public WorkoutDetailResponse finish(UUID userId, UUID id, OneRepMaxFormula formula) {
        Workout workout = loadOwn(userId, id);
        Instant now = clock.instant();
        if (workout.getEndedAt() == null) {
            workout.setEndedAt(now);
            workout.setUpdatedAt(now);
            workoutRepository.save(workout);
        }
        return toDetail(userId, workout, formula);
    }

    /** Soft delete kaskadą po ćwiczeniach i seriach -- tombstone musi dojechać do klienta. */
    @Transactional
    public void delete(UUID userId, UUID id) {
        Workout workout = loadOwn(userId, id);
        Instant now = clock.instant();
        workout.setDeletedAt(now);
        workout.setUpdatedAt(now);
        workoutRepository.save(workout);

        List<WorkoutExercise> exercises =
                workoutExerciseRepository.findByWorkoutIdAndDeletedAtIsNullOrderByOrderIndexAsc(id);
        for (WorkoutExercise exercise : exercises) {
            softDeleteExercise(exercise, now);
        }
    }

    @Transactional
    public WorkoutDetailResponse addExercise(
            UUID userId, UUID workoutId, SaveWorkoutExerciseRequest request, OneRepMaxFormula formula) {
        Workout workout = loadOwn(userId, workoutId);
        verifyExerciseVisible(userId, request.exerciseId());
        Instant now = clock.instant();

        WorkoutExercise exercise = new WorkoutExercise();
        exercise.setId(request.id() != null ? request.id() : UUID.randomUUID());
        exercise.setWorkoutId(workoutId);
        exercise.setExerciseId(request.exerciseId());
        exercise.setOrderIndex(request.orderIndex());
        exercise.setNotes(request.notes());
        exercise.setCreatedAt(now);
        exercise.setUpdatedAt(now);
        workoutExerciseRepository.save(exercise);
        touch(workout, now);

        return toDetail(userId, workout, formula);
    }

    @Transactional
    public WorkoutDetailResponse updateExercise(
            UUID userId,
            UUID workoutId,
            UUID workoutExerciseId,
            SaveWorkoutExerciseRequest request,
            OneRepMaxFormula formula
    ) {
        Workout workout = loadOwn(userId, workoutId);
        WorkoutExercise exercise = loadOwnExercise(workoutId, workoutExerciseId);
        verifyExerciseVisible(userId, request.exerciseId());
        Instant now = clock.instant();

        exercise.setExerciseId(request.exerciseId());
        exercise.setOrderIndex(request.orderIndex());
        exercise.setNotes(request.notes());
        exercise.setUpdatedAt(now);
        workoutExerciseRepository.save(exercise);
        touch(workout, now);

        return toDetail(userId, workout, formula);
    }

    @Transactional
    public WorkoutDetailResponse deleteExercise(
            UUID userId, UUID workoutId, UUID workoutExerciseId, OneRepMaxFormula formula) {
        Workout workout = loadOwn(userId, workoutId);
        WorkoutExercise exercise = loadOwnExercise(workoutId, workoutExerciseId);
        Instant now = clock.instant();
        softDeleteExercise(exercise, now);
        touch(workout, now);

        return toDetail(userId, workout, formula);
    }

    /**
     * Upsert, nie osobne POST/PUT: klient offline generuje UUID serii sam i po
     * odzyskaniu sieci nie wie, czy ta seria zdążyła już dojechać na serwer.
     */
    @Transactional
    public WorkoutDetailResponse saveSet(
            UUID userId,
            UUID workoutId,
            UUID workoutExerciseId,
            UUID setId,
            SaveSetRequest request,
            OneRepMaxFormula formula
    ) {
        Workout workout = loadOwn(userId, workoutId);
        loadOwnExercise(workoutId, workoutExerciseId);
        Instant now = clock.instant();

        UUID effectiveId = setId != null ? setId : (request.id() != null ? request.id() : UUID.randomUUID());
        WorkoutSet set = setRepository.findByIdAndWorkoutExerciseId(effectiveId, workoutExerciseId)
                .orElseGet(() -> {
                    WorkoutSet created = new WorkoutSet();
                    created.setId(effectiveId);
                    created.setWorkoutExerciseId(workoutExerciseId);
                    return created;
                });

        set.setSetIndex(request.setIndex());
        set.setWeightKg(request.weightKg());
        set.setReps(request.reps());
        set.setRpe(request.rpe());
        set.setWarmup(Boolean.TRUE.equals(request.isWarmup()));
        set.setToFailure(Boolean.TRUE.equals(request.toFailure()));
        set.setAssisted(Boolean.TRUE.equals(request.assisted()));
        set.setCompletedAt(request.completedAt() != null ? request.completedAt() : now);
        set.setDeletedAt(null);
        set.setUpdatedAt(now);
        setRepository.save(set);
        touch(workout, now);

        return toDetail(userId, workout, formula);
    }

    @Transactional
    public WorkoutDetailResponse deleteSet(
            UUID userId, UUID workoutId, UUID workoutExerciseId, UUID setId, OneRepMaxFormula formula) {
        Workout workout = loadOwn(userId, workoutId);
        loadOwnExercise(workoutId, workoutExerciseId);
        WorkoutSet set = setRepository.findByIdAndWorkoutExerciseId(setId, workoutExerciseId)
                .orElseThrow(() -> new NotFoundException("Seria nie istnieje: " + setId));

        Instant now = clock.instant();
        set.setDeletedAt(now);
        set.setUpdatedAt(now);
        setRepository.save(set);
        touch(workout, now);

        return toDetail(userId, workout, formula);
    }

    private void copyRoutineItems(UUID routineId, UUID workoutId, Instant now) {
        List<RoutineItem> items =
                routineItemRepository.findByRoutineIdAndDeletedAtIsNullOrderByOrderIndexAsc(routineId);
        List<WorkoutExercise> created = new ArrayList<>();
        for (RoutineItem item : items) {
            WorkoutExercise exercise = new WorkoutExercise();
            exercise.setId(UUID.randomUUID());
            exercise.setWorkoutId(workoutId);
            exercise.setExerciseId(item.getExerciseId());
            exercise.setOrderIndex(item.getOrderIndex());
            exercise.setCreatedAt(now);
            exercise.setUpdatedAt(now);
            created.add(exercise);
        }
        workoutExerciseRepository.saveAll(created);
    }

    private void softDeleteExercise(WorkoutExercise exercise, Instant now) {
        exercise.setDeletedAt(now);
        exercise.setUpdatedAt(now);
        workoutExerciseRepository.save(exercise);

        List<WorkoutSet> sets = setRepository
                .findByWorkoutExerciseIdInAndDeletedAtIsNullOrderBySetIndexAsc(List.of(exercise.getId()));
        for (WorkoutSet set : sets) {
            set.setDeletedAt(now);
            set.setUpdatedAt(now);
        }
        setRepository.saveAll(sets);
    }

    private WorkoutDetailResponse toDetail(UUID userId, Workout workout, OneRepMaxFormula formula) {
        List<WorkoutExercise> exercises =
                workoutExerciseRepository.findByWorkoutIdAndDeletedAtIsNullOrderByOrderIndexAsc(workout.getId());

        Map<UUID, List<WorkoutSet>> setsByExercise = exercises.isEmpty()
                ? Map.of()
                : setRepository.findByWorkoutExerciseIdInAndDeletedAtIsNullOrderBySetIndexAsc(
                        exercises.stream().map(WorkoutExercise::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(WorkoutSet::getWorkoutExerciseId));

        Map<UUID, Exercise> catalog = exercises.isEmpty()
                ? Map.of()
                : exerciseRepository.findAllById(exercises.stream().map(WorkoutExercise::getExerciseId).toList())
                .stream()
                .collect(Collectors.toMap(Exercise::getId, Function.identity(), (a, b) -> a, HashMap::new));

        List<WorkoutExerciseResponse> exerciseResponses = new ArrayList<>();
        List<ExerciseSet> allSets = new ArrayList<>();
        for (WorkoutExercise exercise : exercises) {
            List<WorkoutSet> sets = setsByExercise.getOrDefault(exercise.getId(), List.of());
            List<ExerciseSet> metricSets = sets.stream().map(MetricsMapper::toExerciseSet).toList();
            allSets.addAll(metricSets);
            Exercise catalogEntry = catalog.get(exercise.getExerciseId());

            exerciseResponses.add(new WorkoutExerciseResponse(
                    exercise.getId(),
                    exercise.getWorkoutId(),
                    exercise.getExerciseId(),
                    catalogEntry != null ? catalogEntry.getName() : null,
                    catalogEntry != null ? catalogEntry.getMuscleGroup() : null,
                    catalogEntry != null ? catalogEntry.getEquipment() : null,
                    exercise.getOrderIndex(),
                    exercise.getNotes(),
                    sets.stream().map(set -> SetResponse.from(set, formula)).toList(),
                    SessionMetrics.displayVolumeKg(metricSets),
                    SessionMetrics.prEligibleVolumeKg(metricSets),
                    exercise.getCreatedAt(),
                    exercise.getUpdatedAt(),
                    exercise.getDeletedAt()));
        }

        BigDecimal displayVolume = SessionMetrics.displayVolumeKg(allSets);
        BigDecimal prEligibleVolume = SessionMetrics.prEligibleVolumeKg(allSets);
        long workingSetCount = allSets.stream().filter(set -> !set.isWarmup()).count();

        return new WorkoutDetailResponse(
                workout.getId(),
                workout.getStartedAt(),
                workout.getEndedAt(),
                WorkoutSummaryResponse.durationSeconds(workout.getStartedAt(), workout.getEndedAt()),
                workout.isDeload(),
                workout.getNotes(),
                workout.getRoutineId(),
                exerciseResponses,
                displayVolume,
                prEligibleVolume,
                workingSetCount,
                personalRecordService.brokenIn(
                        userId,
                        workout,
                        exercises.stream().map(WorkoutExercise::getExerciseId).distinct().toList(),
                        formula),
                workout.getCreatedAt(),
                workout.getUpdatedAt());
    }

    private void touch(Workout workout, Instant now) {
        workout.setUpdatedAt(now);
        workoutRepository.save(workout);
    }

    private void verifyExerciseVisible(UUID userId, UUID exerciseId) {
        if (exerciseRepository.findVisibleIds(userId, List.of(exerciseId)).isEmpty()) {
            throw new InvalidRequestException("Ćwiczenie niedostępne dla tego konta: " + exerciseId);
        }
    }

    private Workout loadOwn(UUID userId, UUID id) {
        return workoutRepository.findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new NotFoundException("Trening nie istnieje: " + id));
    }

    private WorkoutExercise loadOwnExercise(UUID workoutId, UUID workoutExerciseId) {
        WorkoutExercise exercise = workoutExerciseRepository
                .findByIdAndWorkoutId(workoutExerciseId, workoutId)
                .orElseThrow(() -> new NotFoundException("Ćwiczenie treningu nie istnieje: " + workoutExerciseId));
        if (exercise.getDeletedAt() != null) {
            throw new NotFoundException("Ćwiczenie treningu nie istnieje: " + workoutExerciseId);
        }
        return exercise;
    }

}
