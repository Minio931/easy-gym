package com.example.easygymbackend.common;

/**
 * Walidacja, której nie da się wyrazić adnotacją na DTO -- np. spójność
 * dwóch pól albo referencja do nieistniejącego ćwiczenia.
 */
public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException(String message) {
        super(message);
    }

}
