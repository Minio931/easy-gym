package com.example.easygymbackend.workout;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.metrics.MetricsMapper;
import com.example.easygymbackend.workout.dto.SaveSetRequest;
import com.example.easygymbackend.workout.dto.SaveWorkoutExerciseRequest;
import com.example.easygymbackend.workout.dto.SaveWorkoutRequest;
import com.example.easygymbackend.workout.dto.WorkoutDetailResponse;
import com.example.easygymbackend.workout.dto.WorkoutListResponse;
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
import java.util.UUID;

@RestController
@RequestMapping("/api/workouts")
public class WorkoutController {

    private static final int MAX_LIMIT = 200;

    private final WorkoutService workoutService;

    public WorkoutController(WorkoutService workoutService) {
        this.workoutService = workoutService;
    }

    @GetMapping
    public WorkoutListResponse list(
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "30") int limit,
            @RequestParam(defaultValue = "0") int offset
    ) {
        return workoutService.list(
                CurrentUser.id(), from, to, Math.clamp(limit, 1, MAX_LIMIT), Math.max(offset, 0));
    }

    /** 204, gdy nie ma otwartego treningu -- front nie musi rozróżniać 404 od błędu. */
    @GetMapping("/active")
    public ResponseEntity<WorkoutDetailResponse> active(@RequestParam(required = false) String formula) {
        return workoutService.active(CurrentUser.id(), MetricsMapper.formula(formula))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/{id}")
    public WorkoutDetailResponse get(
            @PathVariable UUID id, @RequestParam(required = false) String formula) {
        return workoutService.detail(CurrentUser.id(), id, MetricsMapper.formula(formula));
    }

    @PostMapping
    public ResponseEntity<WorkoutDetailResponse> create(
            @Valid @RequestBody SaveWorkoutRequest request, @RequestParam(required = false) String formula) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workoutService.create(CurrentUser.id(), request, MetricsMapper.formula(formula)));
    }

    @PutMapping("/{id}")
    public WorkoutDetailResponse update(
            @PathVariable UUID id,
            @Valid @RequestBody SaveWorkoutRequest request,
            @RequestParam(required = false) String formula
    ) {
        return workoutService.update(CurrentUser.id(), id, request, MetricsMapper.formula(formula));
    }

    @PostMapping("/{id}/finish")
    public WorkoutDetailResponse finish(
            @PathVariable UUID id, @RequestParam(required = false) String formula) {
        return workoutService.finish(CurrentUser.id(), id, MetricsMapper.formula(formula));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        workoutService.delete(CurrentUser.id(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/exercises")
    public ResponseEntity<WorkoutDetailResponse> addExercise(
            @PathVariable UUID id,
            @Valid @RequestBody SaveWorkoutExerciseRequest request,
            @RequestParam(required = false) String formula
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                workoutService.addExercise(CurrentUser.id(), id, request, MetricsMapper.formula(formula)));
    }

    @PutMapping("/{id}/exercises/{workoutExerciseId}")
    public WorkoutDetailResponse updateExercise(
            @PathVariable UUID id,
            @PathVariable UUID workoutExerciseId,
            @Valid @RequestBody SaveWorkoutExerciseRequest request,
            @RequestParam(required = false) String formula
    ) {
        return workoutService.updateExercise(
                CurrentUser.id(), id, workoutExerciseId, request, MetricsMapper.formula(formula));
    }

    @DeleteMapping("/{id}/exercises/{workoutExerciseId}")
    public WorkoutDetailResponse deleteExercise(
            @PathVariable UUID id,
            @PathVariable UUID workoutExerciseId,
            @RequestParam(required = false) String formula
    ) {
        return workoutService.deleteExercise(
                CurrentUser.id(), id, workoutExerciseId, MetricsMapper.formula(formula));
    }

    @PostMapping("/{id}/exercises/{workoutExerciseId}/sets")
    public ResponseEntity<WorkoutDetailResponse> addSet(
            @PathVariable UUID id,
            @PathVariable UUID workoutExerciseId,
            @Valid @RequestBody SaveSetRequest request,
            @RequestParam(required = false) String formula
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(workoutService.saveSet(
                CurrentUser.id(), id, workoutExerciseId, null, request, MetricsMapper.formula(formula)));
    }

    /** PUT z UUID-em z klienta = upsert (patrz WorkoutService#saveSet). */
    @PutMapping("/{id}/exercises/{workoutExerciseId}/sets/{setId}")
    public WorkoutDetailResponse saveSet(
            @PathVariable UUID id,
            @PathVariable UUID workoutExerciseId,
            @PathVariable UUID setId,
            @Valid @RequestBody SaveSetRequest request,
            @RequestParam(required = false) String formula
    ) {
        return workoutService.saveSet(
                CurrentUser.id(), id, workoutExerciseId, setId, request, MetricsMapper.formula(formula));
    }

    @DeleteMapping("/{id}/exercises/{workoutExerciseId}/sets/{setId}")
    public WorkoutDetailResponse deleteSet(
            @PathVariable UUID id,
            @PathVariable UUID workoutExerciseId,
            @PathVariable UUID setId,
            @RequestParam(required = false) String formula
    ) {
        return workoutService.deleteSet(
                CurrentUser.id(), id, workoutExerciseId, setId, MetricsMapper.formula(formula));
    }

}
