package com.example.easygymbackend.sync.dto;

import jakarta.validation.Valid;

import java.time.Instant;

/**
 * `since` = serverTime from the previous successful sync; null on first run
 * (full pull). `changes` may be empty -- a pure pull is also a valid call.
 */
public record SyncRequest(Instant since, @Valid SyncPayload changes) {

    public SyncPayload changesOrEmpty() {
        return changes == null ? SyncPayload.empty() : changes;
    }

}
