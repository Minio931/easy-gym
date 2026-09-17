package com.example.easygymbackend.profile;

import com.example.easygymbackend.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public ProfileService.ProfileResponse get() {
        return profileService.getOrCreate(CurrentUser.get());
    }

    @PutMapping
    public ProfileService.ProfileResponse update(@Valid @RequestBody UpdateProfileRequest request) {
        return profileService.updateDisplayName(CurrentUser.get(), request.displayName());
    }

    /**
     * Formuła e1RM celowo NIE jest tutaj -- liczy się ją na żywo z parametru
     * ?formula= przy każdym zapytaniu, żeby zmiana ustawienia nie fałszowała
     * historii (patrz metrics w CLAUDE.md). Motyw zostaje po stronie klienta.
     */
    public record UpdateProfileRequest(@NotBlank @Size(max = 100) String displayName) {
    }

}
