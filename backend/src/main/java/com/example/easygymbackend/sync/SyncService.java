package com.example.easygymbackend.sync;

import com.example.easygymbackend.bodyweight.BodyWeight;
import com.example.easygymbackend.bodyweight.BodyWeightRepository;
import com.example.easygymbackend.exercise.Equipment;
import com.example.easygymbackend.exercise.Exercise;
import com.example.easygymbackend.exercise.ExerciseRepository;
import com.example.easygymbackend.routine.Routine;
import com.example.easygymbackend.routine.RoutineItem;
import com.example.easygymbackend.routine.RoutineItemRepository;
import com.example.easygymbackend.routine.RoutineRepository;
import com.example.easygymbackend.sync.dto.SyncPayload;
import com.example.easygymbackend.sync.dto.SyncRecords;
import com.example.easygymbackend.sync.dto.SyncRequest;
import com.example.easygymbackend.sync.dto.SyncResponse;
import com.example.easygymbackend.workout.Workout;
import com.example.easygymbackend.workout.WorkoutExercise;
import com.example.easygymbackend.workout.WorkoutExerciseRepository;
import com.example.easygymbackend.workout.WorkoutRepository;
import com.example.easygymbackend.workout.WorkoutSet;
import com.example.easygymbackend.workout.WorkoutSetRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Dwukierunkowa synchronizacja kolejki offline (Dexie) -- etap 5.
 *
 * Reguły, których nie widać z samego kształtu DTO:
 *  * Rozstrzyganie konfliktu: last-write-wins po `updated_at`, ściśle `>`.
 *    Remis = wygrywa serwer (klient i tak dostanie jego wersję w `changes`),
 *    bo dwa różne urządzenia z tym samym znacznikiem czasu to prawie zawsze
 *    ten sam zapis odbity echem, nie realna edycja.
 *  * Kolejność stosowania jest wymuszona kluczami obcymi: ćwiczenia ->
 *    szablony -> pozycje szablonów -> treningi -> ćwiczenia treningu -> serie.
 *    Każdy etap kończy się flushem, żeby następny widział rodziców.
 *  * Właściciel ZAWSZE z JWT. Rekord z cudzym user_id jest odrzucany, nie
 *    "przejmowany" -- to jest ta druga linia obrony zamiast RLS w Postgresie
 *    (decyzja 2 w CLAUDE.md).
 *  * Błędny pojedynczy rekord nie wywraca całej paczki: wraca w `rejected`
 *    z powodem, reszta się zapisuje. Inaczej jedna zepsuta seria blokowałaby
 *    synchronizację telefonu w nieskończoność.
 */
@Service
public class SyncService {

    private final ExerciseRepository exerciseRepository;
    private final RoutineRepository routineRepository;
    private final RoutineItemRepository routineItemRepository;
    private final WorkoutRepository workoutRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;
    private final WorkoutSetRepository setRepository;
    private final BodyWeightRepository bodyWeightRepository;
    private final Clock clock;

    public SyncService(
            ExerciseRepository exerciseRepository,
            RoutineRepository routineRepository,
            RoutineItemRepository routineItemRepository,
            WorkoutRepository workoutRepository,
            WorkoutExerciseRepository workoutExerciseRepository,
            WorkoutSetRepository setRepository,
            BodyWeightRepository bodyWeightRepository,
            Clock clock
    ) {
        this.exerciseRepository = exerciseRepository;
        this.routineRepository = routineRepository;
        this.routineItemRepository = routineItemRepository;
        this.workoutRepository = workoutRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.setRepository = setRepository;
        this.bodyWeightRepository = bodyWeightRepository;
        this.clock = clock;
    }

    @Transactional
    public SyncResponse sync(UUID userId, SyncRequest request) {
        SyncContext context = new SyncContext(userId, clock.instant());
        SyncPayload push = request.changesOrEmpty();

        applyExercises(context, push.exercisesOrEmpty());
        applyRoutines(context, push.routinesOrEmpty());
        applyRoutineItems(context, push.routineItemsOrEmpty());
        applyWorkouts(context, push.workoutsOrEmpty());
        applyWorkoutExercises(context, push.workoutExercisesOrEmpty());
        applySets(context, push.setsOrEmpty());
        applyBodyWeights(context, push.bodyWeightsOrEmpty());

        Instant since = request.since() != null ? request.since() : Instant.EPOCH;
        return new SyncResponse(
                context.now(),
                context.appliedCounts(),
                context.rejections(),
                pull(context, since));
    }

    /* ---------------------------------------------------------------- *
     * PUSH
     * ---------------------------------------------------------------- */

    private void applyExercises(SyncContext context, List<SyncRecords.ExerciseSync> incoming) {
        if (incoming.isEmpty()) {
            return;
        }
        Map<UUID, Exercise> existing = byId(exerciseRepository.findAllById(ids(incoming, SyncRecords.ExerciseSync::id)),
                Exercise::getId);
        List<Exercise> toSave = new ArrayList<>();

        for (SyncRecords.ExerciseSync record : incoming) {
            Instant updatedAt = context.clamp(record.updatedAt());
            Exercise entity = existing.get(record.id());
            if (entity != null) {
                if (entity.isGlobal()) {
                    context.reject(SyncContext.EXERCISES, record.id(),
                            "ćwiczenie z katalogu globalnego jest tylko do odczytu");
                    continue;
                }
                if (!entity.getUserId().equals(context.userId())) {
                    context.reject(SyncContext.EXERCISES, record.id(), SyncContext.REASON_FOREIGN);
                    continue;
                }
                if (!updatedAt.isAfter(entity.getUpdatedAt())) {
                    context.reject(SyncContext.EXERCISES, record.id(), SyncContext.REASON_STALE);
                    continue;
                }
            } else {
                if (isBlank(record.name()) || isBlank(record.muscleGroup())
                        || !Equipment.ALLOWED.contains(record.equipment())) {
                    context.reject(SyncContext.EXERCISES, record.id(),
                            "nowe ćwiczenie wymaga name, muscleGroup i poprawnego equipment");
                    continue;
                }
                entity = new Exercise();
                entity.setId(record.id());
                entity.setUserId(context.userId());
                entity.setCreatedAt(record.createdAt() != null ? record.createdAt() : updatedAt);
            }

            if (!isBlank(record.name())) {
                entity.setName(record.name().trim());
            }
            if (!isBlank(record.muscleGroup())) {
                entity.setMuscleGroup(record.muscleGroup().trim());
            }
            if (record.equipment() != null) {
                if (!Equipment.ALLOWED.contains(record.equipment())) {
                    context.reject(SyncContext.EXERCISES, record.id(),
                            "nieznany typ sprzętu: " + record.equipment());
                    continue;
                }
                entity.setEquipment(record.equipment());
            }
            if (record.isArchived() != null) {
                entity.setArchived(record.isArchived());
            }
            entity.setDeletedAt(record.deletedAt());
            entity.setUpdatedAt(updatedAt);
            toSave.add(entity);
            context.applied(SyncContext.EXERCISES);
        }
        exerciseRepository.saveAllAndFlush(toSave);
    }

    private void applyRoutines(SyncContext context, List<SyncRecords.RoutineSync> incoming) {
        if (incoming.isEmpty()) {
            return;
        }
        Map<UUID, Routine> existing = byId(routineRepository.findAllById(ids(incoming, SyncRecords.RoutineSync::id)),
                Routine::getId);
        List<Routine> toSave = new ArrayList<>();

        for (SyncRecords.RoutineSync record : incoming) {
            Instant updatedAt = context.clamp(record.updatedAt());
            Routine entity = existing.get(record.id());
            if (entity != null) {
                if (!entity.getUserId().equals(context.userId())) {
                    context.reject(SyncContext.ROUTINES, record.id(), SyncContext.REASON_FOREIGN);
                    continue;
                }
                if (!updatedAt.isAfter(entity.getUpdatedAt())) {
                    context.reject(SyncContext.ROUTINES, record.id(), SyncContext.REASON_STALE);
                    continue;
                }
            } else {
                if (isBlank(record.name())) {
                    context.reject(SyncContext.ROUTINES, record.id(), "nowy szablon wymaga name");
                    continue;
                }
                entity = new Routine();
                entity.setId(record.id());
                entity.setUserId(context.userId());
                entity.setCreatedAt(record.createdAt() != null ? record.createdAt() : updatedAt);
            }

            if (!isBlank(record.name())) {
                entity.setName(record.name().trim());
            }
            entity.setNotes(record.notes());
            entity.setDeletedAt(record.deletedAt());
            entity.setUpdatedAt(updatedAt);
            toSave.add(entity);
            context.applied(SyncContext.ROUTINES);
        }
        routineRepository.saveAllAndFlush(toSave);
    }

    private void applyRoutineItems(SyncContext context, List<SyncRecords.RoutineItemSync> incoming) {
        if (incoming.isEmpty()) {
            return;
        }
        Map<UUID, RoutineItem> existing = byId(
                routineItemRepository.findAllById(ids(incoming, SyncRecords.RoutineItemSync::id)),
                RoutineItem::getId);

        Set<UUID> routineIds = new HashSet<>(ids(incoming, SyncRecords.RoutineItemSync::routineId));
        existing.values().forEach(item -> routineIds.add(item.getRoutineId()));
        Set<UUID> ownedRoutines = new HashSet<>(routineRepository.findOwnedIds(context.userId(), routineIds));
        Set<UUID> visibleExercises = new HashSet<>(exerciseRepository.findVisibleIds(
                context.userId(), ids(incoming, SyncRecords.RoutineItemSync::exerciseId)));

        List<RoutineItem> toSave = new ArrayList<>();
        for (SyncRecords.RoutineItemSync record : incoming) {
            Instant updatedAt = context.clamp(record.updatedAt());
            RoutineItem entity = existing.get(record.id());
            if (entity != null && !ownedRoutines.contains(entity.getRoutineId())) {
                context.reject(SyncContext.ROUTINE_ITEMS, record.id(), SyncContext.REASON_FOREIGN);
                continue;
            }
            if (!ownedRoutines.contains(record.routineId())) {
                context.reject(SyncContext.ROUTINE_ITEMS, record.id(),
                        "szablon nie istnieje albo należy do innego konta: " + record.routineId());
                continue;
            }
            if (!visibleExercises.contains(record.exerciseId())) {
                context.reject(SyncContext.ROUTINE_ITEMS, record.id(),
                        "ćwiczenie niedostępne dla tego konta: " + record.exerciseId());
                continue;
            }
            if (entity != null && !updatedAt.isAfter(entity.getUpdatedAt())) {
                context.reject(SyncContext.ROUTINE_ITEMS, record.id(), SyncContext.REASON_STALE);
                continue;
            }
            if (entity == null) {
                entity = new RoutineItem();
                entity.setId(record.id());
                entity.setCreatedAt(record.createdAt() != null ? record.createdAt() : updatedAt);
            }

            entity.setRoutineId(record.routineId());
            entity.setExerciseId(record.exerciseId());
            entity.setOrderIndex(record.orderIndex());
            entity.setTargetSets(record.targetSets());
            entity.setTargetReps(record.targetReps());
            entity.setDeletedAt(record.deletedAt());
            entity.setUpdatedAt(updatedAt);
            toSave.add(entity);
            context.applied(SyncContext.ROUTINE_ITEMS);
        }
        routineItemRepository.saveAllAndFlush(toSave);
    }

    private void applyWorkouts(SyncContext context, List<SyncRecords.WorkoutSync> incoming) {
        if (incoming.isEmpty()) {
            return;
        }
        Map<UUID, Workout> existing = byId(workoutRepository.findAllById(ids(incoming, SyncRecords.WorkoutSync::id)),
                Workout::getId);
        Set<UUID> ownedRoutines = new HashSet<>(routineRepository.findOwnedIds(
                context.userId(),
                incoming.stream().map(SyncRecords.WorkoutSync::routineId).filter(Objects::nonNull).toList()));

        List<Workout> toSave = new ArrayList<>();
        for (SyncRecords.WorkoutSync record : incoming) {
            Instant updatedAt = context.clamp(record.updatedAt());
            Workout entity = existing.get(record.id());
            if (entity != null) {
                if (!entity.getUserId().equals(context.userId())) {
                    context.reject(SyncContext.WORKOUTS, record.id(), SyncContext.REASON_FOREIGN);
                    continue;
                }
                if (!updatedAt.isAfter(entity.getUpdatedAt())) {
                    context.reject(SyncContext.WORKOUTS, record.id(), SyncContext.REASON_STALE);
                    continue;
                }
            } else {
                if (record.startedAt() == null) {
                    context.reject(SyncContext.WORKOUTS, record.id(), "nowy trening wymaga startedAt");
                    continue;
                }
                entity = new Workout();
                entity.setId(record.id());
                entity.setUserId(context.userId());
                entity.setCreatedAt(record.createdAt() != null ? record.createdAt() : updatedAt);
            }
            if (record.routineId() != null && !ownedRoutines.contains(record.routineId())) {
                context.reject(SyncContext.WORKOUTS, record.id(),
                        "szablon nie istnieje albo należy do innego konta: " + record.routineId());
                continue;
            }

            if (record.startedAt() != null) {
                entity.setStartedAt(record.startedAt());
            }
            entity.setEndedAt(record.endedAt());
            entity.setRoutineId(record.routineId());
            entity.setNotes(record.notes());
            if (record.isDeload() != null) {
                entity.setDeload(record.isDeload());
            }
            entity.setDeletedAt(record.deletedAt());
            entity.setUpdatedAt(updatedAt);
            toSave.add(entity);
            context.applied(SyncContext.WORKOUTS);
        }
        workoutRepository.saveAllAndFlush(toSave);
    }

    private void applyWorkoutExercises(SyncContext context, List<SyncRecords.WorkoutExerciseSync> incoming) {
        if (incoming.isEmpty()) {
            return;
        }
        Map<UUID, WorkoutExercise> existing = byId(
                workoutExerciseRepository.findAllById(ids(incoming, SyncRecords.WorkoutExerciseSync::id)),
                WorkoutExercise::getId);

        Set<UUID> workoutIds = new HashSet<>(ids(incoming, SyncRecords.WorkoutExerciseSync::workoutId));
        existing.values().forEach(item -> workoutIds.add(item.getWorkoutId()));
        Set<UUID> ownedWorkouts = new HashSet<>(workoutRepository.findOwnedIds(context.userId(), workoutIds));
        Set<UUID> visibleExercises = new HashSet<>(exerciseRepository.findVisibleIds(
                context.userId(), ids(incoming, SyncRecords.WorkoutExerciseSync::exerciseId)));

        List<WorkoutExercise> toSave = new ArrayList<>();
        for (SyncRecords.WorkoutExerciseSync record : incoming) {
            Instant updatedAt = context.clamp(record.updatedAt());
            WorkoutExercise entity = existing.get(record.id());
            if (entity != null && !ownedWorkouts.contains(entity.getWorkoutId())) {
                context.reject(SyncContext.WORKOUT_EXERCISES, record.id(), SyncContext.REASON_FOREIGN);
                continue;
            }
            if (!ownedWorkouts.contains(record.workoutId())) {
                context.reject(SyncContext.WORKOUT_EXERCISES, record.id(),
                        "trening nie istnieje albo należy do innego konta: " + record.workoutId());
                continue;
            }
            if (!visibleExercises.contains(record.exerciseId())) {
                context.reject(SyncContext.WORKOUT_EXERCISES, record.id(),
                        "ćwiczenie niedostępne dla tego konta: " + record.exerciseId());
                continue;
            }
            if (entity != null && !updatedAt.isAfter(entity.getUpdatedAt())) {
                context.reject(SyncContext.WORKOUT_EXERCISES, record.id(), SyncContext.REASON_STALE);
                continue;
            }
            if (entity == null) {
                entity = new WorkoutExercise();
                entity.setId(record.id());
                entity.setCreatedAt(record.createdAt() != null ? record.createdAt() : updatedAt);
            }

            entity.setWorkoutId(record.workoutId());
            entity.setExerciseId(record.exerciseId());
            entity.setOrderIndex(record.orderIndex());
            entity.setNotes(record.notes());
            entity.setDeletedAt(record.deletedAt());
            entity.setUpdatedAt(updatedAt);
            toSave.add(entity);
            context.applied(SyncContext.WORKOUT_EXERCISES);
        }
        workoutExerciseRepository.saveAllAndFlush(toSave);
    }

    private void applySets(SyncContext context, List<SyncRecords.SetSync> incoming) {
        if (incoming.isEmpty()) {
            return;
        }
        Map<UUID, WorkoutSet> existing = byId(setRepository.findAllById(ids(incoming, SyncRecords.SetSync::id)),
                WorkoutSet::getId);

        Set<UUID> parentIds = new HashSet<>(ids(incoming, SyncRecords.SetSync::workoutExerciseId));
        existing.values().forEach(set -> parentIds.add(set.getWorkoutExerciseId()));
        Set<UUID> ownedParents = new HashSet<>(workoutExerciseRepository.findOwnedIds(context.userId(), parentIds));

        List<WorkoutSet> toSave = new ArrayList<>();
        for (SyncRecords.SetSync record : incoming) {
            Instant updatedAt = context.clamp(record.updatedAt());
            WorkoutSet entity = existing.get(record.id());
            if (entity != null && !ownedParents.contains(entity.getWorkoutExerciseId())) {
                context.reject(SyncContext.SETS, record.id(), SyncContext.REASON_FOREIGN);
                continue;
            }
            if (!ownedParents.contains(record.workoutExerciseId())) {
                context.reject(SyncContext.SETS, record.id(),
                        "ćwiczenie treningu nie istnieje albo należy do innego konta: "
                                + record.workoutExerciseId());
                continue;
            }
            if (entity != null && !updatedAt.isAfter(entity.getUpdatedAt())) {
                context.reject(SyncContext.SETS, record.id(), SyncContext.REASON_STALE);
                continue;
            }
            String violation = validateSet(record);
            if (violation != null) {
                context.reject(SyncContext.SETS, record.id(), violation);
                continue;
            }
            if (entity == null) {
                entity = new WorkoutSet();
                entity.setId(record.id());
            }

            entity.setWorkoutExerciseId(record.workoutExerciseId());
            entity.setSetIndex(record.setIndex());
            entity.setWeightKg(record.weightKg());
            entity.setReps(record.reps());
            entity.setRpe(record.rpe());
            entity.setWarmup(Boolean.TRUE.equals(record.isWarmup()));
            entity.setToFailure(Boolean.TRUE.equals(record.toFailure()));
            entity.setAssisted(Boolean.TRUE.equals(record.assisted()));
            entity.setCompletedAt(record.completedAt() != null ? record.completedAt() : updatedAt);
            entity.setDeletedAt(record.deletedAt());
            entity.setUpdatedAt(updatedAt);
            toSave.add(entity);
            context.applied(SyncContext.SETS);
        }
        setRepository.saveAllAndFlush(toSave);
    }

    /**
     * Konflikt "jeden żywy wpis na dzień" rozstrzygany tak samo jak każdy inny
     * konflikt -- po updated_at. Przegrany wpis dostaje tombstone (a nie jest
     * kasowany), więc drugie urządzenie dowie się, że zniknął.
     */
    private void applyBodyWeights(SyncContext context, List<SyncRecords.BodyWeightSync> incoming) {
        if (incoming.isEmpty()) {
            return;
        }
        Map<UUID, BodyWeight> existing = byId(
                bodyWeightRepository.findAllById(ids(incoming, SyncRecords.BodyWeightSync::id)),
                BodyWeight::getId);

        for (SyncRecords.BodyWeightSync record : incoming) {
            Instant updatedAt = context.clamp(record.updatedAt());
            BodyWeight entity = existing.get(record.id());
            if (entity != null) {
                if (!entity.getUserId().equals(context.userId())) {
                    context.reject(SyncContext.BODY_WEIGHTS, record.id(), SyncContext.REASON_FOREIGN);
                    continue;
                }
                if (!updatedAt.isAfter(entity.getUpdatedAt())) {
                    context.reject(SyncContext.BODY_WEIGHTS, record.id(), SyncContext.REASON_STALE);
                    continue;
                }
            } else {
                if (record.measuredOn() == null || record.weightKg() == null) {
                    context.reject(SyncContext.BODY_WEIGHTS, record.id(),
                            "nowy wpis wagi wymaga measuredOn i weightKg");
                    continue;
                }
                entity = new BodyWeight();
                entity.setId(record.id());
                entity.setUserId(context.userId());
                entity.setMeasuredOn(record.measuredOn());
            }
            if (record.weightKg() != null && !isValidBodyWeight(record.weightKg())) {
                context.reject(SyncContext.BODY_WEIGHTS, record.id(), "waga poza zakresem 0-400 kg");
                continue;
            }

            LocalDate day = record.measuredOn() != null ? record.measuredOn() : entity.getMeasuredOn();
            if (record.deletedAt() == null && !resolveDayConflict(context, record.id(), day, updatedAt)) {
                continue;
            }

            entity.setMeasuredOn(day);
            if (record.weightKg() != null) {
                entity.setWeightKg(record.weightKg());
            }
            entity.setNote(record.note());
            entity.setDeletedAt(record.deletedAt());
            entity.setUpdatedAt(updatedAt);
            bodyWeightRepository.saveAndFlush(entity);
            context.applied(SyncContext.BODY_WEIGHTS);
        }
    }

    /** @return false, gdy przychodzący wpis przegrał z istniejącym wpisem z tego dnia. */
    private boolean resolveDayConflict(SyncContext context, UUID incomingId, LocalDate day, Instant updatedAt) {
        BodyWeight sameDay = bodyWeightRepository
                .findByUserIdAndMeasuredOnAndDeletedAtIsNull(context.userId(), day)
                .orElse(null);
        if (sameDay == null || sameDay.getId().equals(incomingId)) {
            return true;
        }
        if (!updatedAt.isAfter(sameDay.getUpdatedAt())) {
            context.reject(SyncContext.BODY_WEIGHTS, incomingId,
                    "nowszy wpis na ten dzień już istnieje: " + sameDay.getId());
            return false;
        }
        sameDay.setDeletedAt(context.now());
        sameDay.setUpdatedAt(context.now());
        bodyWeightRepository.saveAndFlush(sameDay);
        // Przegrany rekord wraca do klienta jako tombstone, nawet gdy jego
        // updated_at jest starsze niż `since` z zapytania.
        context.reject(SyncContext.BODY_WEIGHTS, sameDay.getId(),
                "zastąpiony nowszym wpisem na ten sam dzień: " + incomingId);
        return true;
    }

    /* ---------------------------------------------------------------- *
     * PULL
     * ---------------------------------------------------------------- */

    private SyncPayload pull(SyncContext context, Instant since) {
        UUID userId = context.userId();
        return new SyncPayload(
                merge(exerciseRepository.findChangedSince(userId, since),
                        exerciseRepository.findOwnedOrGlobalByIds(userId, context.forced(SyncContext.EXERCISES)),
                        Exercise::getId, SyncMapper::toSync),
                merge(routineRepository.findByUserIdAndUpdatedAtAfter(userId, since),
                        routineRepository.findByUserIdAndIdIn(userId, context.forced(SyncContext.ROUTINES)),
                        Routine::getId, SyncMapper::toSync),
                merge(routineItemRepository.findChangedSince(userId, since),
                        routineItemRepository.findOwnedByIds(userId, context.forced(SyncContext.ROUTINE_ITEMS)),
                        RoutineItem::getId, SyncMapper::toSync),
                merge(workoutRepository.findByUserIdAndUpdatedAtAfter(userId, since),
                        workoutRepository.findByUserIdAndIdIn(userId, context.forced(SyncContext.WORKOUTS)),
                        Workout::getId, SyncMapper::toSync),
                merge(workoutExerciseRepository.findChangedSince(userId, since),
                        workoutExerciseRepository.findOwnedByIds(
                                userId, context.forced(SyncContext.WORKOUT_EXERCISES)),
                        WorkoutExercise::getId, SyncMapper::toSync),
                merge(setRepository.findChangedSince(userId, since),
                        setRepository.findOwnedByIds(userId, context.forced(SyncContext.SETS)),
                        WorkoutSet::getId, SyncMapper::toSync),
                merge(bodyWeightRepository.findByUserIdAndUpdatedAtAfter(userId, since),
                        bodyWeightRepository.findByUserIdAndIdIn(userId, context.forced(SyncContext.BODY_WEIGHTS)),
                        BodyWeight::getId, SyncMapper::toSync));
    }

    /* ---------------------------------------------------------------- *
     * Narzędzia
     * ---------------------------------------------------------------- */

    private static <E, D> List<D> merge(
            List<E> changed, List<E> forced, Function<E, UUID> id, Function<E, D> mapper) {
        Map<UUID, E> unique = new LinkedHashMap<>();
        changed.forEach(entity -> unique.put(id.apply(entity), entity));
        forced.forEach(entity -> unique.putIfAbsent(id.apply(entity), entity));
        return unique.values().stream().map(mapper).toList();
    }

    private static <T> List<UUID> ids(Collection<T> records, Function<T, UUID> extractor) {
        return records.stream().map(extractor).filter(Objects::nonNull).distinct().toList();
    }

    private static <E> Map<UUID, E> byId(List<E> entities, Function<E, UUID> id) {
        return entities.stream().collect(Collectors.toMap(id, Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isValidBodyWeight(BigDecimal weight) {
        return weight.compareTo(BigDecimal.ZERO) > 0 && weight.compareTo(BigDecimal.valueOf(400)) < 0;
    }

    /** Lustro CHECK-ów z V3 -- pojedyncza zła seria ma wrócić w `rejected`, nie wywalić paczki. */
    private static String validateSet(SyncRecords.SetSync record) {
        if (record.weightKg() == null) {
            return "seria wymaga weightKg";
        }
        if (record.weightKg().compareTo(BigDecimal.ZERO) < 0
                || record.weightKg().compareTo(BigDecimal.valueOf(500)) > 0) {
            return "ciężar poza zakresem 0-500 kg";
        }
        if (record.reps() < 1 || record.reps() > 100) {
            return "liczba powtórzeń poza zakresem 1-100";
        }
        if (record.rpe() != null && (record.rpe().compareTo(BigDecimal.ONE) < 0
                || record.rpe().compareTo(BigDecimal.TEN) > 0)) {
            return "RPE poza zakresem 1-10";
        }
        return null;
    }

}
