package com.example.easygymbackend.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank @Size(min = 2, max = 64) String login,
        @NotBlank @Size(min = 8, max = 200) String password
) {
}
