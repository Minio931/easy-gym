package com.example.easygymbackend.admin;

/**
 * Wrong/missing X-Bootstrap-Secret on /api/admin/users. Separate exception from
 * BadCredentialsException (login auth) -- this is not a login attempt, this is
 * an attempt to access an admin endpoint, semantically 403, not 401.
 */
public class InvalidBootstrapSecretException extends RuntimeException {

    public InvalidBootstrapSecretException() {
        super("Invalid or missing admin bootstrap secret");
    }

}
