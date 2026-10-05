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
 * One call = push + pull. The client sends everything it has queued and
 * receives back the changes since `since` (its own from another device, plus
 * conflict resolutions).
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
