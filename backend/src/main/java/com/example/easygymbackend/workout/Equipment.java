package com.example.easygymbackend.workout;

import java.util.Locale;

/** Wartości dokładnie jak CHECK w migracji V3 (chk_exercises_equipment). */
public enum Equipment {
    BARBELL,
    DUMBBELL,
    MACHINE,
    CABLE,
    BODYWEIGHT,
    OTHER;

    String toDbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    static Equipment fromDbValue(String value) {
        return Equipment.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
