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
 * Stan jednego wywołania /api/sync: licznik zastosowanych zmian, lista
 * odrzuceń i zbiór rekordów, które trzeba dociągnąć do odpowiedzi mimo
 * filtra `since` (bo klient ma ich nieaktualną wersję).
 */
final class SyncContext {

    static final String EXERCISES = "exercises";
    static final String ROUTINES = "routines";
    static final String ROUTINE_ITEMS = "routineItems";
    static final String WORKOUTS = "workouts";
    static final String WORKOUT_EXERCISES = "workoutExercises";
    static final String SETS = "sets";
    static final String BODY_WEIGHTS = "bodyWeights";

    static final String REASON_STALE = "starsza wersja niż na serwerze (last-write-wins)";
    static final String REASON_FOREIGN = "rekord należy do innego konta";

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
     * Zegar klienta bywa przestawiony do przodu; bez tego jeden telefon z
     * datą w 2030 wygrywałby każdy kolejny konflikt LWW na zawsze.
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
