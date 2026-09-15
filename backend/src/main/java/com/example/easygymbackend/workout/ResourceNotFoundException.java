package com.example.easygymbackend.workout;

/**
 * Rzucany zarówno gdy zasób faktycznie nie istnieje, jak i gdy istnieje ale
 * należy do innego usera -- celowo ten sam wyjątek/status (404, nie 403),
 * żeby nie zdradzać przez kod odpowiedzi że cudze dane w ogóle istnieją.
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }

}
