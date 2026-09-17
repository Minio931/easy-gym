package com.example.easygymbackend.bodyweight;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.bodyweight.dto.BodyWeightResponse;
import com.example.easygymbackend.bodyweight.dto.BodyWeightStatsResponse;
import com.example.easygymbackend.bodyweight.dto.SaveBodyWeightRequest;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/body-weights")
public class BodyWeightController {

    private final BodyWeightService bodyWeightService;

    public BodyWeightController(BodyWeightService bodyWeightService) {
        this.bodyWeightService = bodyWeightService;
    }

    @GetMapping
    public List<BodyWeightResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return bodyWeightService.list(CurrentUser.id(), from, to);
    }

    /** Średnie tygodniowe ISO, krocząca 7-dniowa, trend 4-tygodniowy. */
    @GetMapping("/stats")
    public BodyWeightStatsResponse stats(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return bodyWeightService.stats(CurrentUser.id(), from, to);
    }

    /** PUT bez id w ścieżce, bo kluczem biznesowym jest data pomiaru, nie UUID. */
    @PutMapping
    public BodyWeightResponse save(@Valid @RequestBody SaveBodyWeightRequest request) {
        return bodyWeightService.save(CurrentUser.id(), request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        bodyWeightService.delete(CurrentUser.id(), id);
        return ResponseEntity.noContent().build();
    }

}
