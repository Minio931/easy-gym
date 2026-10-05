package com.example.easygymbackend.sync.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * `serverTime` is the START-of-transaction stamp -- the client saves it as
 * `since` for the next sync. Rejected records (older version, body-weight
 * day conflict) come back in `changes` in the server's version, even when
 * their updatedAt is older than `since` -- this way the client converges to
 * the server state without an extra round.
 */
public record SyncResponse(
        Instant serverTime,
        Map<String, Integer> applied,
        List<Rejection> rejected,
        SyncPayload changes
) {

    public record Rejection(String table, UUID id, String reason) {
    }

}
