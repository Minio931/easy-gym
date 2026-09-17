package com.example.easygymbackend.sync.dto;

import jakarta.validation.Valid;

import java.time.Instant;

/**
 * `since` = serverTime z poprzedniej udanej synchronizacji; null przy
 * pierwszym uruchomieniu (pełny zaciąg). `changes` może być puste -- sam
 * pull też jest poprawnym wywołaniem.
 */
public record SyncRequest(Instant since, @Valid SyncPayload changes) {

    public SyncPayload changesOrEmpty() {
        return changes == null ? SyncPayload.empty() : changes;
    }

}
