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
 * Zamiennik ręcznego generowania bcrypt hashy (PasswordHashCli) -- konta
 * nadal nie mają self-service rejestracji, ale zamiast lokalnego CLI +
 * ręcznej migracji Flyway, jest jeden chroniony endpoint. "Chroniony" =
 * osobny sekret współdzielony (ADMIN_BOOTSTRAP_SECRET), nie JWT -- w
 * momencie zakładania pierwszego konta nie ma jeszcze czym się zalogować.
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
        user = userRepository.save(user);

        return new CreateUserResponse(user.getId(), user.getLogin(), user.getCreatedAt());
    }

    private void verifyBootstrapSecret(String providedSecret) {
        if (providedSecret == null) {
            throw new InvalidBootstrapSecretException();
        }

        byte[] provided = providedSecret.getBytes(StandardCharsets.UTF_8);
        byte[] expected = adminProperties.bootstrapSecret().getBytes(StandardCharsets.UTF_8);

        // MessageDigest.isEqual jest stałoczasowe -- porównanie == na String
        // ujawniałoby przez timing, ile początkowych znaków sekretu zgadza się.
        if (!MessageDigest.isEqual(provided, expected)) {
            throw new InvalidBootstrapSecretException();
        }
    }

}
