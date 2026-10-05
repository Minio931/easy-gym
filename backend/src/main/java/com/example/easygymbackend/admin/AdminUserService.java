package com.example.easygymbackend.admin;

import com.example.easygymbackend.admin.dto.CreateUserResponse;
import com.example.easygymbackend.config.AdminProperties;
import com.example.easygymbackend.user.User;
import com.example.easygymbackend.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

/**
 * Replacement for manual bcrypt hash generation (PasswordHashCli) -- accounts
 * still have no self-service registration, but instead of a local CLI +
 * manual Flyway migration, there is a single protected endpoint. "Protected" =
 * a separate shared secret (ADMIN_BOOTSTRAP_SECRET), not JWT -- at the moment
 * the first account is being created there is nothing to log in with yet.
 */
@Service
public class AdminUserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AdminProperties adminProperties;

    public AdminUserService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AdminProperties adminProperties
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminProperties = adminProperties;
    }

    @Transactional
    public CreateUserResponse createUser(String providedSecret, String login, String rawPassword) {
        verifyBootstrapSecret(providedSecret);

        if (userRepository.findByLogin(login).isPresent()) {
            throw new UserAlreadyExistsException(login);
        }

        User user = new User();
        user.setId(UUID.randomUUID());
        user.setLogin(login);
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        // saveAndFlush, not save -- @CreationTimestamp on createdAt is computed by
        // Hibernate only when building the INSERT (flush), not on the save() call.
        // Without a forced flush this method returned createdAt=null, even though the
        // (NOT NULL) column in the database received its correct value at commit time.
        user = userRepository.saveAndFlush(user);

        return new CreateUserResponse(user.getId(), user.getLogin(), user.getCreatedAt());
    }

    private void verifyBootstrapSecret(String providedSecret) {
        if (providedSecret == null) {
            throw new InvalidBootstrapSecretException();
        }

        byte[] provided = providedSecret.getBytes(StandardCharsets.UTF_8);
        byte[] expected = adminProperties.bootstrapSecret().getBytes(StandardCharsets.UTF_8);

        // MessageDigest.isEqual is constant-time -- a == comparison on String
        // would reveal through timing how many leading characters of the secret match.
        if (!MessageDigest.isEqual(provided, expected)) {
            throw new InvalidBootstrapSecretException();
        }
    }

}
