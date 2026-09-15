package com.example.easygymbackend.sync.dto;

import jakarta.validation.Valid;

import java.time.Instant;

/** since = null przy pierwszej synchronizacji (pełny pull wszystkiego, co user ma na serwerze). */
public record SyncPushRequest(
        Instant since,
        @Valid SyncBatch changes
) {
}
