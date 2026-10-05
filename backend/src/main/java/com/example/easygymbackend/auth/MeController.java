package com.example.easygymbackend.auth;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Minimal protected endpoint confirming the JWT pipeline works
 * end-to-end. Eventually the first step toward the future /api/profile.
 */
@RestController
@RequestMapping("/api")
public class MeController {

    @GetMapping("/me")
    public MeResponse me() {
        AuthenticatedUser user = CurrentUser.get();
        return new MeResponse(user.userId(), user.login());
    }

    public record MeResponse(UUID userId, String login) {
    }

}
