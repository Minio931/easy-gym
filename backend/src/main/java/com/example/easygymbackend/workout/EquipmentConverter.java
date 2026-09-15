package com.example.easygymbackend.workout;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * DB trzyma lowercase ('barbell', ...) -- seed z V4 już ma te wartości, więc
 * konwersja musi być dokładnie odwrotna do Equipment.name().toLowerCase(),
 * nie generyczny @Enumerated(STRING) (który zapisałby "BARBELL").
 */
@Converter(autoApply = true)
public class EquipmentConverter implements AttributeConverter<Equipment, String> {

    @Override
    public String convertToDatabaseColumn(Equipment attribute) {
        return attribute == null ? null : attribute.toDbValue();
    }

    @Override
    public Equipment convertToEntityAttribute(String dbData) {
        return dbData == null ? null : Equipment.fromDbValue(dbData);
    }

}
