package com.example.easygymbackend.sync.dto;

import java.time.Instant;

public record SyncPullResponse(
        Instant syncedAt,
        SyncBatch changes
) {
}
