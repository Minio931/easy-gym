package com.example.easygymbackend.admin;

/**
 * Zły/brakujący X-Bootstrap-Secret na /api/admin/users. Osobny wyjątek od
 * BadCredentialsException (auth logowania) -- to nie jest próba logowania,
 * to próba dostępu do endpointu admina, semantycznie 403, nie 401.
 */
public class InvalidBootstrapSecretException extends RuntimeException {

    public InvalidBootstrapSecretException() {
        super("Nieprawidłowy lub brakujący sekret administracyjny");
    }

}
