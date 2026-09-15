package com.example.easygymbackend.bodyweight;

import com.example.easygymbackend.bodyweight.dto.BodyWeightProgressResponse;
import com.example.easygymbackend.bodyweight.dto.BodyWeightResponse;
import com.example.easygymbackend.bodyweight.dto.CreateBodyWeightRequest;
import com.example.easygymbackend.bodyweight.dto.UpdateBodyWeightRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/body-weights")
public class BodyWeightController {

    private final BodyWeightService bodyWeightService;

    public BodyWeightController(BodyWeightService bodyWeightService) {
        this.bodyWeightService = bodyWeightService;
    }

    @PostMapping
    public ResponseEntity<BodyWeightResponse> create(@Valid @RequestBody CreateBodyWeightRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(bodyWeightService.create(request));
    }

    @PatchMapping("/{id}")
    public BodyWeightResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateBodyWeightRequest request) {
        return bodyWeightService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        bodyWeightService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public BodyWeightProgressResponse getProgress() {
        return bodyWeightService.getProgress();
    }

}
