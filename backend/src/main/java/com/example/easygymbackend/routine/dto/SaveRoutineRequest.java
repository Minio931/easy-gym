package com.example.easygymbackend.routine.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * PUT podmienia CAŁĄ listę pozycji: te, których nie ma w request, dostają
 * deleted_at (tombstone), a nie DELETE -- usunięcie pozycji szablonu też
 * musi dojechać do drugiego urządzenia.
 */
public record SaveRoutineRequest(
        UUID id,
        @NotBlank @Size(max = 200) String name,
        @Size(max = 2000) String notes,
        @Valid List<Item> items
) {

    public record Item(
            UUID id,
            @NotNull UUID exerciseId,
            @Min(0) int orderIndex,
            @Min(1) @Max(50) Integer targetSets,
            @Min(1) @Max(100) Integer targetReps
    ) {
    }

}
