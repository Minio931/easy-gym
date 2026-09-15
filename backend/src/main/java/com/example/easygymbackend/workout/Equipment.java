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

    // public -- SyncService potrzebuje tego samego mapowania przy budowaniu
    // surowego SQL (upsert z LWW omija encje JPA/EquipmentConverter celowo,
    // patrz komentarz w SyncService), więc jedna definicja, nie dwie kopie.
    public String toDbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static Equipment fromDbValue(String value) {
        return Equipment.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
