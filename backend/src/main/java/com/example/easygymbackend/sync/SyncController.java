package com.example.easygymbackend.sync;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.sync.dto.SyncPullResponse;
import com.example.easygymbackend.sync.dto.SyncPushRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private final SyncService syncService;

    public SyncController(SyncService syncService) {
        this.syncService = syncService;
    }

    /** Push lokalnych zmian + pull wszystkiego zmienionego od `since` w jednym round-tripie. */
    @PostMapping
    public SyncPullResponse push(@Valid @RequestBody SyncPushRequest request) {
        return syncService.push(request);
    }

    /** Pull-only, bez pushowania niczego -- np. świeża instalacja apki na nowym urządzeniu. */
    @GetMapping
    public SyncPullResponse pull(@RequestParam(required = false) Instant since) {
        return syncService.pull(CurrentUser.id(), since);
    }

}
