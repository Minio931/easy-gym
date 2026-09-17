package com.example.easygymbackend.routine;

import com.example.easygymbackend.common.InvalidRequestException;
import com.example.easygymbackend.common.NotFoundException;
import com.example.easygymbackend.exercise.ExerciseRepository;
import com.example.easygymbackend.routine.dto.RoutineItemResponse;
import com.example.easygymbackend.routine.dto.RoutineResponse;
import com.example.easygymbackend.routine.dto.SaveRoutineRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class RoutineService {

    private final RoutineRepository routineRepository;
    private final RoutineItemRepository routineItemRepository;
    private final ExerciseRepository exerciseRepository;
    private final Clock clock;

    public RoutineService(
            RoutineRepository routineRepository,
            RoutineItemRepository routineItemRepository,
            ExerciseRepository exerciseRepository,
            Clock clock
    ) {
        this.routineRepository = routineRepository;
        this.routineItemRepository = routineItemRepository;
        this.exerciseRepository = exerciseRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<RoutineResponse> list(UUID userId) {
        List<Routine> routines = routineRepository.findByUserIdAndDeletedAtIsNullOrderByNameAsc(userId);
        if (routines.isEmpty()) {
            return List.of();
        }

        // Jeden SELECT na wszystkie pozycje zamiast N+1 po jednym na szablon.
        Map<UUID, List<RoutineItemResponse>> itemsByRoutine = routineItemRepository
                .findByRoutineIdInAndDeletedAtIsNullOrderByOrderIndexAsc(
                        routines.stream().map(Routine::getId).toList())
                .stream()
                .map(RoutineItemResponse::from)
                .collect(Collectors.groupingBy(RoutineItemResponse::routineId));

        return routines.stream()
                .map(routine -> RoutineResponse.from(
                        routine, itemsByRoutine.getOrDefault(routine.getId(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public RoutineResponse get(UUID userId, UUID id) {
        Routine routine = loadOwn(userId, id);
        return RoutineResponse.from(routine, items(routine.getId()));
    }

    @Transactional
    public RoutineResponse create(UUID userId, SaveRoutineRequest request) {
        Instant now = clock.instant();
        Routine routine = new Routine();
        routine.setId(request.id() != null ? request.id() : UUID.randomUUID());
        routine.setUserId(userId);
        routine.setName(request.name().trim());
        routine.setNotes(request.notes());
        routine.setCreatedAt(now);
        routine.setUpdatedAt(now);
        routineRepository.save(routine);

        replaceItems(userId, routine.getId(), request.items(), now);
        return RoutineResponse.from(routine, items(routine.getId()));
    }

    @Transactional
    public RoutineResponse update(UUID userId, UUID id, SaveRoutineRequest request) {
        Routine routine = loadOwn(userId, id);
        Instant now = clock.instant();
        routine.setName(request.name().trim());
        routine.setNotes(request.notes());
        routine.setUpdatedAt(now);
        routineRepository.save(routine);

        replaceItems(userId, routine.getId(), request.items(), now);
        return RoutineResponse.from(routine, items(routine.getId()));
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        Routine routine = loadOwn(userId, id);
        Instant now = clock.instant();
        routine.setDeletedAt(now);
        routine.setUpdatedAt(now);
        routineRepository.save(routine);

        // Tombstone na pozycjach też -- klient kasuje po deleted_at, nie po kaskadzie FK.
        for (RoutineItem item : routineItemRepository
                .findByRoutineIdAndDeletedAtIsNullOrderByOrderIndexAsc(id)) {
            item.setDeletedAt(now);
            item.setUpdatedAt(now);
            routineItemRepository.save(item);
        }
    }

    private void replaceItems(UUID userId, UUID routineId, List<SaveRoutineRequest.Item> requested, Instant now) {
        List<SaveRoutineRequest.Item> items = requested == null ? List.of() : requested;
        verifyExercisesVisible(userId, items.stream().map(SaveRoutineRequest.Item::exerciseId).toList());

        Map<UUID, RoutineItem> existing = routineItemRepository
                .findByRoutineIdAndDeletedAtIsNullOrderByOrderIndexAsc(routineId).stream()
                .collect(Collectors.toMap(RoutineItem::getId, item -> item));

        Set<UUID> keptIds = new HashSet<>();
        List<RoutineItem> toSave = new ArrayList<>();
        for (SaveRoutineRequest.Item requestedItem : items) {
            UUID itemId = requestedItem.id() != null ? requestedItem.id() : UUID.randomUUID();
            RoutineItem item = existing.get(itemId);
            if (item == null) {
                item = new RoutineItem();
                item.setId(itemId);
                item.setRoutineId(routineId);
                item.setCreatedAt(now);
            }
            item.setExerciseId(requestedItem.exerciseId());
            item.setOrderIndex(requestedItem.orderIndex());
            item.setTargetSets(requestedItem.targetSets());
            item.setTargetReps(requestedItem.targetReps());
            item.setUpdatedAt(now);
            keptIds.add(itemId);
            toSave.add(item);
        }

        for (RoutineItem removed : existing.values()) {
            if (!keptIds.contains(removed.getId())) {
                removed.setDeletedAt(now);
                removed.setUpdatedAt(now);
                toSave.add(removed);
            }
        }
        routineItemRepository.saveAll(toSave);
    }

    private void verifyExercisesVisible(UUID userId, List<UUID> exerciseIds) {
        if (exerciseIds.isEmpty()) {
            return;
        }
        Set<UUID> visible = new HashSet<>(exerciseRepository.findVisibleIds(userId, exerciseIds));
        for (UUID exerciseId : exerciseIds) {
            if (!visible.contains(exerciseId)) {
                throw new InvalidRequestException("Ćwiczenie niedostępne dla tego konta: " + exerciseId);
            }
        }
    }

    private List<RoutineItemResponse> items(UUID routineId) {
        return routineItemRepository.findByRoutineIdAndDeletedAtIsNullOrderByOrderIndexAsc(routineId).stream()
                .map(RoutineItemResponse::from)
                .toList();
    }

    private Routine loadOwn(UUID userId, UUID id) {
        return routineRepository.findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new NotFoundException("Szablon nie istnieje: " + id));
    }

}
