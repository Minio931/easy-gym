package com.example.easygymbackend.common;

/**
 * Validation that cannot be expressed with a DTO annotation -- e.g. consistency
 * between two fields or a reference to a non-existent exercise.
 */
public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException(String message) {
        super(message);
    }

}
