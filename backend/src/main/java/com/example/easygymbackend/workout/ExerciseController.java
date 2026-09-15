package com.example.easygymbackend.workout;

import com.example.easygymbackend.metrics.OneRepMaxFormula;
import com.example.easygymbackend.workout.dto.CreateExerciseRequest;
import com.example.easygymbackend.workout.dto.ExerciseProgressResponse;
import com.example.easygymbackend.workout.dto.ExerciseResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/exercises")
public class ExerciseController {

    private final ExerciseService exerciseService;
    private final ExerciseProgressService exerciseProgressService;

    public ExerciseController(ExerciseService exerciseService, ExerciseProgressService exerciseProgressService) {
        this.exerciseService = exerciseService;
        this.exerciseProgressService = exerciseProgressService;
    }

    @GetMapping
    public List<ExerciseResponse> search(@RequestParam(required = false) String search) {
        return exerciseService.search(search);
    }

    @PostMapping
    public ResponseEntity<ExerciseResponse> create(@Valid @RequestBody CreateExerciseRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(exerciseService.create(request));
    }

    /**
     * Główny wykres ćwiczenia (sekcja 4/6 promptu) + aktualne PR. formula
     * domyślnie EPLEY -- nie ma jeszcze endpointu/encji ustawień usera, więc
     * na razie przez query param, nie zapisany profil (patrz CLAUDE.md).
     */
    @GetMapping("/{id}/progress")
    public ExerciseProgressResponse getProgress(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "EPLEY") OneRepMaxFormula formula
    ) {
        return exerciseProgressService.getProgress(id, formula);
    }

}
