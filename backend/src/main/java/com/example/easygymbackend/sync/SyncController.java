package com.example.easygymbackend.sync;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.sync.dto.SyncRequest;
import com.example.easygymbackend.sync.dto.SyncResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Jedno wywołanie = push + pull. Klient wysyła wszystko, co ma w kolejce, i
 * dostaje z powrotem zmiany od `since` (własne z innego urządzenia oraz
 * rozstrzygnięcia konfliktów).
 */
@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private final SyncService syncService;

    public SyncController(SyncService syncService) {
        this.syncService = syncService;
    }

    @PostMapping
    public SyncResponse sync(@Valid @RequestBody SyncRequest request) {
        return syncService.sync(CurrentUser.id(), request);
    }

}
