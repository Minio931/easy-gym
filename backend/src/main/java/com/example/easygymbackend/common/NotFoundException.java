package com.example.easygymbackend.common;

/**
 * The record does not exist OR belongs to a different user -- deliberately the
 * same exception (404) in both cases. Distinguishing 404/403 would reveal that
 * a given UUID exists on another user's account.
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

}
