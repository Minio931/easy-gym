package com.example.easygymbackend.admin;

public class UserAlreadyExistsException extends RuntimeException {

    public UserAlreadyExistsException(String login) {
        super("Login '" + login + "' is already taken");
    }

}
