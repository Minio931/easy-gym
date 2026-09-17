package com.example.easygymbackend.sync.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * `serverTime` to znacznik POCZĄTKU transakcji -- klient zapisuje go jako
 * `since` do następnej synchronizacji. Rekordy odrzucone (starsza wersja,
 * konflikt dnia w wadze) wracają w `changes` w wersji serwerowej, nawet jeśli
 * ich updatedAt jest starsze niż `since` -- dzięki temu klient zbiega się do
 * stanu serwera bez dodatkowej rundy.
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
