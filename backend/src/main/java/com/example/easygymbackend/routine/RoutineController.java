package com.example.easygymbackend.routine;

import com.example.easygymbackend.auth.CurrentUser;
import com.example.easygymbackend.routine.dto.RoutineResponse;
import com.example.easygymbackend.routine.dto.SaveRoutineRequest;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/routines")
public class RoutineController {

    private final RoutineService routineService;

    public RoutineController(RoutineService routineService) {
        this.routineService = routineService;
    }

    @GetMapping
    public List<RoutineResponse> list() {
        return routineService.list(CurrentUser.id());
    }

    @GetMapping("/{id}")
    public RoutineResponse get(@PathVariable UUID id) {
        return routineService.get(CurrentUser.id(), id);
    }

    @PostMapping
    public ResponseEntity<RoutineResponse> create(@Valid @RequestBody SaveRoutineRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(routineService.create(CurrentUser.id(), request));
    }

    @PutMapping("/{id}")
    public RoutineResponse update(@PathVariable UUID id, @Valid @RequestBody SaveRoutineRequest request) {
        return routineService.update(CurrentUser.id(), id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        routineService.delete(CurrentUser.id(), id);
        return ResponseEntity.noContent().build();
    }

}
