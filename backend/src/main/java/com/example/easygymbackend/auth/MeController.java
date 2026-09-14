package com.example.easygymbackend.auth;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Minimalny chroniony endpoint potwierdzający, że pipeline JWT działa
 * end-to-end. Docelowo pierwszy krok pod przyszłe /api/profile.
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
