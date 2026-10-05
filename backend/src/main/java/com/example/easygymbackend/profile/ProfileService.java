package com.example.easygymbackend.profile;

import com.example.easygymbackend.auth.AuthenticatedUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.UUID;

@Service
public class ProfileService {

    private final ProfileRepository profileRepository;
    private final Clock clock;

    public ProfileService(ProfileRepository profileRepository, Clock clock) {
        this.profileRepository = profileRepository;
        this.clock = clock;
    }

    /**
     * Accounts are created by AdminUserService, which does NOT create a row
     * in profiles -- we materialize it here on the first read, so there is
     * no need for a migration or manual seed with every new account.
     */
    @Transactional
    public ProfileResponse getOrCreate(AuthenticatedUser user) {
        Profile profile = profileRepository.findById(user.userId()).orElseGet(() -> {
            Profile created = new Profile();
            created.setId(user.userId());
            created.setDisplayName(user.login());
            created.setUnit("kg");
            created.setCreatedAt(clock.instant());
            return profileRepository.saveAndFlush(created);
        });
        return toResponse(user, profile);
    }

    @Transactional
    public ProfileResponse updateDisplayName(AuthenticatedUser user, String displayName) {
        getOrCreate(user);
        Profile profile = profileRepository.findById(user.userId()).orElseThrow();
        profile.setDisplayName(displayName.trim());
        return toResponse(user, profileRepository.save(profile));
    }

    private static ProfileResponse toResponse(AuthenticatedUser user, Profile profile) {
        return new ProfileResponse(
                user.userId(), user.login(), profile.getDisplayName(), profile.getUnit(), profile.getCreatedAt());
    }

    public record ProfileResponse(
            UUID userId,
            String login,
            String displayName,
            String unit,
            java.time.Instant createdAt
    ) {
    }

}
