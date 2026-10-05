package com.example.easygymbackend.common;

/**
 * Operation on a record the user can see but is not allowed to modify -- in
 * practice, global exercises (exercises.user_id IS NULL). This is 403, not
 * 404, because the existence of the record is not a secret anyway (it is in the seed).
 */
public class ForbiddenOperationException extends RuntimeException {

    public ForbiddenOperationException(String message) {
        super(message);
    }

}
