package com.example.easygymbackend.common;

/**
 * Operacja na rekordzie, który user widzi, ale którego nie wolno mu zmieniać
 * -- w praktyce ćwiczenia globalne (exercises.user_id IS NULL). Tu 403, nie
 * 404, bo istnienie rekordu i tak nie jest tajemnicą (jest w seedzie).
 */
public class ForbiddenOperationException extends RuntimeException {

    public ForbiddenOperationException(String message) {
        super(message);
    }

}
