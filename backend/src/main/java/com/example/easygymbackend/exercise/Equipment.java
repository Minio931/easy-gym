package com.example.easygymbackend.exercise;

import com.example.easygymbackend.common.InvalidRequestException;

import java.util.Set;

/**
 * Lustro CHECK-a chk_exercises_equipment z migracji V3. Walidacja tutaj jest
 * po to, żeby user dostał 400 z czytelnym komunikatem zamiast 409 z
 * DataIntegrityViolationException -- baza i tak jest ostatnią linią obrony.
 */
public final class Equipment {

    public static final Set<String> ALLOWED =
            Set.of("barbell", "dumbbell", "machine", "cable", "bodyweight", "other");

    private Equipment() {
    }

    public static String validated(String equipment) {
        if (equipment == null || !ALLOWED.contains(equipment)) {
            throw new InvalidRequestException(
                    "Nieznany typ sprzętu: " + equipment + " (dozwolone: " + String.join(", ", ALLOWED) + ")");
        }
        return equipment;
    }

}
