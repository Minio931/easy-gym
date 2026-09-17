package com.example.easygymbackend.exercise;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.exercise.dto.ExerciseHistoryResponse;
import com.example.easygymbackend.exercise.dto.ExerciseResponse;
import com.example.easygymbackend.exercise.dto.SaveExerciseRequest;
import com.example.easygymbackend.metrics.MetricsMapper;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/exercises")
public class ExerciseController {

    private static final int MAX_HISTORY_SESSIONS = 500;

    private final ExerciseService exerciseService;
    private final ExerciseHistoryService exerciseHistoryService;

    public ExerciseController(ExerciseService exerciseService, ExerciseHistoryService exerciseHistoryService) {
        this.exerciseService = exerciseService;
        this.exerciseHistoryService = exerciseHistoryService;
    }

    @GetMapping
    public List<ExerciseResponse> list(
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "false") boolean includeArchived
    ) {
        return exerciseService.list(CurrentUser.id(), query, includeArchived);
    }

    @GetMapping("/{id}")
    public ExerciseResponse get(@PathVariable UUID id) {
        return exerciseService.get(CurrentUser.id(), id);
    }

    /** Dane ekranu ćwiczenia: sesje chronologicznie + aktualne rekordy. */
    @GetMapping("/{id}/history")
    public ExerciseHistoryResponse history(
            @PathVariable UUID id,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(required = false) String formula
    ) {
        return exerciseHistoryService.history(
                CurrentUser.id(),
                id,
                from != null ? from : Instant.EPOCH,
                to != null ? to : Instant.now().plusSeconds(86_400),
                Math.clamp(limit, 1, MAX_HISTORY_SESSIONS),
                MetricsMapper.formula(formula));
    }

    @PostMapping
    public ResponseEntity<ExerciseResponse> create(@Valid @RequestBody SaveExerciseRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(exerciseService.create(CurrentUser.id(), request));
    }

    @PutMapping("/{id}")
    public ExerciseResponse update(@PathVariable UUID id, @Valid @RequestBody SaveExerciseRequest request) {
        return exerciseService.update(CurrentUser.id(), id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        exerciseService.delete(CurrentUser.id(), id);
        return ResponseEntity.noContent().build();
    }

}
