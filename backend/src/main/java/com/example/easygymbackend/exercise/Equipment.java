package com.example.easygymbackend.exercise;

import com.example.easygymbackend.common.InvalidRequestException;

import java.util.Set;

/**
 * Mirror of the CHECK chk_exercises_equipment from migration V3. Validation
 * here exists so the user gets 400 with a readable message instead of 409
 * from a DataIntegrityViolationException -- the database is the last line
 * of defense anyway.
 */
public final class Equipment {

    public static final Set<String> ALLOWED =
            Set.of("barbell", "dumbbell", "machine", "cable", "bodyweight", "other");

    private Equipment() {
    }

    public static String validated(String equipment) {
        if (equipment == null || !ALLOWED.contains(equipment)) {
            throw new InvalidRequestException(
                    "Unknown equipment type: " + equipment + " (allowed: " + String.join(", ", ALLOWED) + ")");
        }
        return equipment;
    }

}
