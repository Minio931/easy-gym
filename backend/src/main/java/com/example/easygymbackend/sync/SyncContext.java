package com.example.easygymbackend.sync;

import com.example.easygymbackend.sync.dto.SyncResponse;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * State of a single /api/sync call: counter of applied changes, list of
 * rejections and a set of records to force into the response despite the
 * `since` filter (because the client has an outdated version of them).
 */
final class SyncContext {

    static final String EXERCISES = "exercises";
    static final String ROUTINES = "routines";
    static final String ROUTINE_ITEMS = "routineItems";
    static final String WORKOUTS = "workouts";
    static final String WORKOUT_EXERCISES = "workoutExercises";
    static final String SETS = "sets";
    static final String BODY_WEIGHTS = "bodyWeights";

    static final String REASON_STALE = "older version than on the server (last-write-wins)";
    static final String REASON_FOREIGN = "record belongs to a different account";

    private final UUID userId;
    private final Instant now;
    private final Map<String, Integer> applied = new LinkedHashMap<>();
    private final List<SyncResponse.Rejection> rejected = new ArrayList<>();
    private final Map<String, Set<UUID>> forced = new HashMap<>();

    SyncContext(UUID userId, Instant now) {
        this.userId = userId;
        this.now = now;
    }

    UUID userId() {
        return userId;
    }

    Instant now() {
        return now;
    }

    /**
     * Client clocks sometimes run ahead; without this one phone with a date
     * set to 2030 would win every subsequent LWW conflict forever.
     */
    Instant clamp(Instant clientUpdatedAt) {
        return clientUpdatedAt.isAfter(now) ? now : clientUpdatedAt;
    }

    void applied(String table) {
        applied.merge(table, 1, Integer::sum);
    }

    void reject(String table, UUID id, String reason) {
        rejected.add(new SyncResponse.Rejection(table, id, reason));
        forced.computeIfAbsent(table, key -> new HashSet<>()).add(id);
    }

    Set<UUID> forced(String table) {
        return forced.getOrDefault(table, Set.of());
    }

    Map<String, Integer> appliedCounts() {
        return applied;
    }

    List<SyncResponse.Rejection> rejections() {
        return rejected;
    }

}
