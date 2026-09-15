package com.example.easygymbackend.workout;

import com.example.easygymbackend.workout.dto.AddExerciseRequest;
import com.example.easygymbackend.workout.dto.StartWorkoutRequest;
import com.example.easygymbackend.workout.dto.UpdateWorkoutRequest;
import com.example.easygymbackend.workout.dto.WorkoutDetailResponse;
import com.example.easygymbackend.workout.dto.WorkoutExerciseResponse;
import com.example.easygymbackend.workout.dto.WorkoutSummaryResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/workouts")
public class WorkoutController {

    private final WorkoutService workoutService;

    public WorkoutController(WorkoutService workoutService) {
        this.workoutService = workoutService;
    }

    @PostMapping
    public ResponseEntity<WorkoutSummaryResponse> start(@Valid @RequestBody StartWorkoutRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(workoutService.start(request));
    }

    @PatchMapping("/{id}")
    public WorkoutSummaryResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateWorkoutRequest request) {
        return workoutService.update(id, request);
    }

    @GetMapping("/{id}")
    public WorkoutDetailResponse getDetail(@PathVariable UUID id) {
        return workoutService.getDetail(id);
    }

    @GetMapping
    public List<WorkoutSummaryResponse> list() {
        return workoutService.list();
    }

    @PostMapping("/{id}/exercises")
    public ResponseEntity<WorkoutExerciseResponse> addExercise(
            @PathVariable UUID id, @Valid @RequestBody AddExerciseRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(workoutService.addExercise(id, request));
    }

}
