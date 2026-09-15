package com.example.easygymbackend.sync;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.sync.dto.ExerciseSyncRecord;
import com.example.easygymbackend.sync.dto.SetSyncRecord;
import com.example.easygymbackend.sync.dto.SyncBatch;
import com.example.easygymbackend.sync.dto.SyncPullResponse;
import com.example.easygymbackend.sync.dto.SyncPushRequest;
import com.example.easygymbackend.sync.dto.WorkoutExerciseSyncRecord;
import com.example.easygymbackend.sync.dto.WorkoutSyncRecord;
import com.example.easygymbackend.workout.Equipment;
import com.example.easygymbackend.workout.Exercise;
import com.example.easygymbackend.workout.ExerciseRepository;
import com.example.easygymbackend.workout.Workout;
import com.example.easygymbackend.workout.WorkoutExercise;
import com.example.easygymbackend.workout.WorkoutExerciseRepository;
import com.example.easygymbackend.workout.WorkoutRepository;
import com.example.easygymbackend.workout.WorkoutSet;
import com.example.easygymbackend.workout.WorkoutSetRepository;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Endpoint synchronizacji dla kolejki Dexie (sekcja 1 pkt 4 promptu) --
 * projektowany od razu jako część API, tak jak ustalono w decyzji 4.
 *
 * Upsert po SQL wprost (NamedParameterJdbcTemplate), NIE przez encje JPA --
 * @CreationTimestamp/@UpdateTimestamp na encjach z pakietu workout zawsze
 * nadpisałyby updatedAt własnym zegarem serwera, a tu MUSI wygrać wartość od
 * klienta (LWW). To świadomy wyjątek od "encje JPA wszędzie", nie niedopatrzenie.
 *
 * Walidacja własności: cały batch pada (400), jeśli którykolwiek rekord
 * (bezpośrednio przez id, albo przez referencję workoutId/exerciseId/
 * workoutExerciseId) dotyka danych innego usera -- decyzja użytkownika,
 * nie cichy skip. @Transactional gwarantuje że nic się nie zapisze, jeśli
 * walidacja padnie w trakcie.
 */
@Service
public class SyncService {

    private final NamedParameterJdbcTemplate jdbc;
    private final ExerciseRepository exerciseRepository;
    private final WorkoutRepository workoutRepository;
    private final WorkoutExerciseRepository workoutExerciseRepository;
    private final WorkoutSetRepository workoutSetRepository;

    public SyncService(
            NamedParameterJdbcTemplate jdbc,
            ExerciseRepository exerciseRepository,
            WorkoutRepository workoutRepository,
            WorkoutExerciseRepository workoutExerciseRepository,
            WorkoutSetRepository workoutSetRepository
    ) {
        this.jdbc = jdbc;
        this.exerciseRepository = exerciseRepository;
        this.workoutRepository = workoutRepository;
        this.workoutExerciseRepository = workoutExerciseRepository;
        this.workoutSetRepository = workoutSetRepository;
    }

    @Transactional
    public SyncPullResponse push(SyncPushRequest request) {
        UUID userId = CurrentUser.id();
        Instant startedAt = Instant.now();

        List<ExerciseSyncRecord> exercises = nullToEmpty(request.changes() == null ? null : request.changes().exercises());
        List<WorkoutSyncRecord> workouts = nullToEmpty(request.changes() == null ? null : request.changes().workouts());
        List<WorkoutExerciseSyncRecord> workoutExercises =
                nullToEmpty(request.changes() == null ? null : request.changes().workoutExercises());
        List<SetSyncRecord> sets = nullToEmpty(request.changes() == null ? null : request.changes().sets());

        validateOwnership(userId, exercises, workouts, workoutExercises, sets);

        for (ExerciseSyncRecord record : exercises) {
            upsertExercise(userId, record);
        }
        for (WorkoutSyncRecord record : workouts) {
            upsertWorkout(userId, record);
        }
        for (WorkoutExerciseSyncRecord record : workoutExercises) {
            upsertWorkoutExercise(record);
        }
        for (SetSyncRecord record : sets) {
            upsertSet(record);
        }

        return pull(userId, request.since());
    }

    // @Transactional(readOnly=true), nie tylko @Transactional na push() --
    // toRecord(WorkoutExercise)/toRecord(WorkoutSet) nawigują po leniwych
    // relacjach (workout/exercise), a open-in-view=false zamyka sesję zaraz
    // po zapytaniu bez otwartej transakcji (patrz identyczny bug w WorkoutService).
    @Transactional(readOnly = true)
    public SyncPullResponse pull(UUID userId, Instant since) {
        Instant syncedAt = Instant.now();
        // Postgres (extended query protocol) nie potrafi wywnioskować typu dla
        // gołego "? IS NULL" bez kontekstu kolumny -- stąd JPQL bez gałęzi
        // "since IS NULL", a null "since" (pierwsza synchronizacja) reprezentowany
        // jako Instant.EPOCH (i tak starszy niż cokolwiek w bazie).
        Instant effectiveSince = since == null ? Instant.EPOCH : since;

        SyncBatch batch = new SyncBatch(
                exerciseRepository.findChangedSince(userId, effectiveSince).stream().map(SyncService::toRecord).toList(),
                workoutRepository.findChangedSince(userId, effectiveSince).stream().map(SyncService::toRecord).toList(),
                workoutExerciseRepository.findChangedSince(userId, effectiveSince).stream().map(SyncService::toRecord).toList(),
                workoutSetRepository.findChangedSince(userId, effectiveSince).stream().map(SyncService::toRecord).toList()
        );

        return new SyncPullResponse(syncedAt, batch);
    }

    // --- Walidacja własności -----------------------------------------------

    private void validateOwnership(
            UUID userId,
            List<ExerciseSyncRecord> exercises,
            List<WorkoutSyncRecord> workouts,
            List<WorkoutExerciseSyncRecord> workoutExercises,
            List<SetSyncRecord> sets
    ) {
        Set<UUID> batchExerciseIds = exercises.stream().map(ExerciseSyncRecord::id).collect(java.util.stream.Collectors.toSet());
        Set<UUID> batchWorkoutIds = workouts.stream().map(WorkoutSyncRecord::id).collect(java.util.stream.Collectors.toSet());
        Set<UUID> batchWorkoutExerciseIds =
                workoutExercises.stream().map(WorkoutExerciseSyncRecord::id).collect(java.util.stream.Collectors.toSet());

        rejectIfExistingRowsOwnedByOther("exercises", batchExerciseIds, userId,
                "SELECT id FROM exercises WHERE id IN (:ids) AND (user_id IS NULL OR user_id <> :userId)");
        rejectIfExistingRowsOwnedByOther("workouts", batchWorkoutIds, userId,
                "SELECT id FROM workouts WHERE id IN (:ids) AND user_id <> :userId");
        rejectIfExistingRowsOwnedByOther("workout_exercises", batchWorkoutExerciseIds, userId,
                """
                SELECT we.id FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id
                WHERE we.id IN (:ids) AND w.user_id <> :userId
                """);
        rejectIfExistingRowsOwnedByOther("sets",
                sets.stream().map(SetSyncRecord::id).collect(java.util.stream.Collectors.toSet()), userId,
                """
                SELECT s.id FROM sets s
                JOIN workout_exercises we ON we.id = s.workout_exercise_id
                JOIN workouts w ON w.id = we.workout_id
                WHERE s.id IN (:ids) AND w.user_id <> :userId
                """);

        // Referencje "w dół" dla NOWYCH rekordów muszą wskazywać na coś widocznego
        // dla usera -- albo już w bazie na jego koncie, albo w TYM SAMYM batchu
        // (typowy przypadek: cała sesja treningowa zsynchronizowana za jednym razem).
        Set<UUID> referencedWorkoutIds = workoutExercises.stream()
                .map(WorkoutExerciseSyncRecord::workoutId).collect(java.util.stream.Collectors.toSet());
        rejectIfReferencesInvalid("workout_exercises.workoutId", referencedWorkoutIds, batchWorkoutIds, userId,
                "SELECT id FROM workouts WHERE id IN (:ids) AND user_id = :userId");

        Set<UUID> referencedExerciseIds = workoutExercises.stream()
                .map(WorkoutExerciseSyncRecord::exerciseId).collect(java.util.stream.Collectors.toSet());
        rejectIfReferencesInvalid("workout_exercises.exerciseId", referencedExerciseIds, batchExerciseIds, userId,
                "SELECT id FROM exercises WHERE id IN (:ids) AND (user_id IS NULL OR user_id = :userId)");

        Set<UUID> referencedWorkoutExerciseIds = sets.stream()
                .map(SetSyncRecord::workoutExerciseId).collect(java.util.stream.Collectors.toSet());
        rejectIfReferencesInvalid("sets.workoutExerciseId", referencedWorkoutExerciseIds, batchWorkoutExerciseIds, userId,
                """
                SELECT we.id FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id
                WHERE we.id IN (:ids) AND w.user_id = :userId
                """);
    }

    private void rejectIfExistingRowsOwnedByOther(String label, Set<UUID> ids, UUID userId, String sql) {
        if (ids.isEmpty()) {
            return;
        }
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("ids", ids).addValue("userId", userId);
        List<UUID> violating = jdbc.queryForList(sql, params, UUID.class);
        if (!violating.isEmpty()) {
            throw new SyncOwnershipViolationException(
                    "Batch odrzucony: " + label + " zawiera id należące do innego konta");
        }
    }

    private void rejectIfReferencesInvalid(
            String label, Set<UUID> referencedIds, Set<UUID> validInBatch, UUID userId, String sql) {
        Set<UUID> needsDbCheck = new HashSet<>(referencedIds);
        needsDbCheck.removeAll(validInBatch);
        if (needsDbCheck.isEmpty()) {
            return;
        }
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("ids", needsDbCheck).addValue("userId", userId);
        List<UUID> ownedInDb = jdbc.queryForList(sql, params, UUID.class);
        if (ownedInDb.size() < needsDbCheck.size()) {
            throw new SyncOwnershipViolationException(
                    "Batch odrzucony: " + label + " odwołuje się do rekordu spoza konta lub nieistniejącego");
        }
    }

    // --- Upsert z LWW (INSERT ... ON CONFLICT ... WHERE updated_at < EXCLUDED.updated_at) -----

    private void upsertExercise(UUID userId, ExerciseSyncRecord r) {
        jdbc.update("""
                INSERT INTO exercises (id, user_id, name, muscle_group, equipment, is_archived, created_at, updated_at, deleted_at)
                VALUES (:id, :userId, :name, :muscleGroup, :equipment, :archived, now(), :updatedAt, :deletedAt)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    muscle_group = EXCLUDED.muscle_group,
                    equipment = EXCLUDED.equipment,
                    is_archived = EXCLUDED.is_archived,
                    updated_at = EXCLUDED.updated_at,
                    deleted_at = EXCLUDED.deleted_at
                WHERE exercises.updated_at < EXCLUDED.updated_at
                """, new MapSqlParameterSource()
                .addValue("id", r.id())
                .addValue("userId", userId)
                .addValue("name", r.name())
                .addValue("muscleGroup", r.muscleGroup())
                .addValue("equipment", r.equipment().toDbValue())
                .addValue("archived", r.archived())
                .addValue("updatedAt", toTimestamp(r.updatedAt()))
                .addValue("deletedAt", toTimestamp(r.deletedAt())));
    }

    private void upsertWorkout(UUID userId, WorkoutSyncRecord r) {
        jdbc.update("""
                INSERT INTO workouts (id, user_id, started_at, ended_at, routine_id, notes, is_deload, created_at, updated_at, deleted_at)
                VALUES (:id, :userId, :startedAt, :endedAt, :routineId, :notes, :deload, now(), :updatedAt, :deletedAt)
                ON CONFLICT (id) DO UPDATE SET
                    started_at = EXCLUDED.started_at,
                    ended_at = EXCLUDED.ended_at,
                    routine_id = EXCLUDED.routine_id,
                    notes = EXCLUDED.notes,
                    is_deload = EXCLUDED.is_deload,
                    updated_at = EXCLUDED.updated_at,
                    deleted_at = EXCLUDED.deleted_at
                WHERE workouts.updated_at < EXCLUDED.updated_at
                """, new MapSqlParameterSource()
                .addValue("id", r.id())
                .addValue("userId", userId)
                .addValue("startedAt", toTimestamp(r.startedAt()))
                .addValue("endedAt", toTimestamp(r.endedAt()))
                .addValue("routineId", r.routineId())
                .addValue("notes", r.notes())
                .addValue("deload", r.deload())
                .addValue("updatedAt", toTimestamp(r.updatedAt()))
                .addValue("deletedAt", toTimestamp(r.deletedAt())));
    }

    private void upsertWorkoutExercise(WorkoutExerciseSyncRecord r) {
        jdbc.update("""
                INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, notes, created_at, updated_at, deleted_at)
                VALUES (:id, :workoutId, :exerciseId, :orderIndex, :notes, now(), :updatedAt, :deletedAt)
                ON CONFLICT (id) DO UPDATE SET
                    workout_id = EXCLUDED.workout_id,
                    exercise_id = EXCLUDED.exercise_id,
                    order_index = EXCLUDED.order_index,
                    notes = EXCLUDED.notes,
                    updated_at = EXCLUDED.updated_at,
                    deleted_at = EXCLUDED.deleted_at
                WHERE workout_exercises.updated_at < EXCLUDED.updated_at
                """, new MapSqlParameterSource()
                .addValue("id", r.id())
                .addValue("workoutId", r.workoutId())
                .addValue("exerciseId", r.exerciseId())
                .addValue("orderIndex", r.orderIndex())
                .addValue("notes", r.notes())
                .addValue("updatedAt", toTimestamp(r.updatedAt()))
                .addValue("deletedAt", toTimestamp(r.deletedAt())));
    }

    private void upsertSet(SetSyncRecord r) {
        jdbc.update("""
                INSERT INTO sets (id, workout_exercise_id, set_index, weight_kg, reps, rpe, is_warmup, to_failure, assisted, completed_at, updated_at, deleted_at)
                VALUES (:id, :workoutExerciseId, :setIndex, :weightKg, :reps, :rpe, :warmup, :toFailure, :assisted, :completedAt, :updatedAt, :deletedAt)
                ON CONFLICT (id) DO UPDATE SET
                    workout_exercise_id = EXCLUDED.workout_exercise_id,
                    set_index = EXCLUDED.set_index,
                    weight_kg = EXCLUDED.weight_kg,
                    reps = EXCLUDED.reps,
                    rpe = EXCLUDED.rpe,
                    is_warmup = EXCLUDED.is_warmup,
                    to_failure = EXCLUDED.to_failure,
                    assisted = EXCLUDED.assisted,
                    completed_at = EXCLUDED.completed_at,
                    updated_at = EXCLUDED.updated_at,
                    deleted_at = EXCLUDED.deleted_at
                WHERE sets.updated_at < EXCLUDED.updated_at
                """, new MapSqlParameterSource()
                .addValue("id", r.id())
                .addValue("workoutExerciseId", r.workoutExerciseId())
                .addValue("setIndex", r.setIndex())
                .addValue("weightKg", r.weightKg())
                .addValue("reps", r.reps())
                .addValue("rpe", r.rpe())
                .addValue("warmup", r.warmup())
                .addValue("toFailure", r.toFailure())
                .addValue("assisted", r.assisted())
                .addValue("completedAt", toTimestamp(r.completedAt()))
                .addValue("updatedAt", toTimestamp(r.updatedAt()))
                .addValue("deletedAt", toTimestamp(r.deletedAt())));
    }

    // Sterownik JDBC Postgresa nie potrafi wywnioskować typu SQL dla gołego
    // java.time.Instant przez NamedParameterJdbcTemplate (w odróżnieniu od
    // Hibernate/JPA, które ma własny type system) -- java.sql.Timestamp działa.
    private static java.sql.Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : java.sql.Timestamp.from(instant);
    }

    // --- Mapowanie encja -> rekord sync (pull) ------------------------------

    private static ExerciseSyncRecord toRecord(Exercise e) {
        return new ExerciseSyncRecord(
                e.getId(), e.getName(), e.getMuscleGroup(), e.getEquipment(), e.isArchived(),
                e.getUpdatedAt(), e.getDeletedAt());
    }

    private static WorkoutSyncRecord toRecord(Workout w) {
        return new WorkoutSyncRecord(
                w.getId(), w.getStartedAt(), w.getEndedAt(), w.getRoutineId(), w.getNotes(), w.isDeload(),
                w.getUpdatedAt(), w.getDeletedAt());
    }

    private static WorkoutExerciseSyncRecord toRecord(WorkoutExercise we) {
        return new WorkoutExerciseSyncRecord(
                we.getId(), we.getWorkout().getId(), we.getExercise().getId(), we.getOrderIndex(), we.getNotes(),
                we.getUpdatedAt(), we.getDeletedAt());
    }

    private static SetSyncRecord toRecord(WorkoutSet s) {
        return new SetSyncRecord(
                s.getId(), s.getWorkoutExercise().getId(), s.getSetIndex(), s.getWeightKg(), s.getReps(), s.getRpe(),
                s.isWarmup(), s.isToFailure(), s.isAssisted(), s.getCompletedAt(), s.getUpdatedAt(), s.getDeletedAt());
    }

    private static <T> List<T> nullToEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }

}
