package com.example.easygymbackend.common;

/**
 * Rekord nie istnieje ALBO należy do innego użytkownika -- celowo ten sam
 * wyjątek (404) w obu przypadkach. Rozróżnienie 404/403 zdradzałoby, że
 * dany UUID istnieje na koncie drugiego usera.
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

}
