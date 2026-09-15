package com.example.easygymbackend.workout;

import com.example.easygymbackend.workout.dto.AddSetRequest;
import com.example.easygymbackend.workout.dto.SetResponse;
import com.example.easygymbackend.workout.dto.UpdateSetRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class SetController {

    private final SetService setService;

    public SetController(SetService setService) {
        this.setService = setService;
    }

    @PostMapping("/api/workout-exercises/{workoutExerciseId}/sets")
    public ResponseEntity<SetResponse> add(
            @PathVariable UUID workoutExerciseId, @Valid @RequestBody AddSetRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(setService.add(workoutExerciseId, request));
    }

    @PatchMapping("/api/sets/{id}")
    public SetResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateSetRequest request) {
        return setService.update(id, request);
    }

    @DeleteMapping("/api/sets/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        setService.delete(id);
        return ResponseEntity.noContent().build();
    }

}
