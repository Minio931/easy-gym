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
 * PUT replaces the ENTIRE item list: those missing from the request get
 * deleted_at (tombstone), not a DELETE -- removing a routine item must also
 * reach the other device.
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
