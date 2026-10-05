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
     * The e1RM formula deliberately does NOT live here -- it is computed on
     * the fly from the ?formula= parameter on each request, so that changing
     * the setting does not falsify history (see metrics in CLAUDE.md). The
     * theme stays on the client side.
     */
    public record UpdateProfileRequest(@NotBlank @Size(max = 100) String displayName) {
    }

}
