package com.example.easygymbackend.db;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Weryfikuje, że migracje Flyway (V1-V4) aplikują się czysto na świeżej
 * bazie i że kluczowe ograniczenia integralności faktycznie działają --
 * nie tylko że tabele istnieją.
 */
@SpringBootTest
@Testcontainers
class SchemaMigrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void seedujeSzescdziesiatGlobalnychCwiczen() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exercises WHERE user_id IS NULL", Integer.class);

        assertThat(count).isEqualTo(60);
    }

    @Test
    void odrzucaNieznanyTypSprzetu() {
        UUID id = UUID.randomUUID();

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO exercises (id, user_id, name, muscle_group, equipment) "
                        + "VALUES (?, NULL, 'Test', 'test', 'kettlebell')",
                id))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void odrzucaCiezarPozaZakresem() {
        UUID userId = utworzUzytkownika();
        UUID workoutId = utworzTrening(userId);
        UUID workoutExerciseId = utworzWorkoutExercise(workoutId);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO sets (id, workout_exercise_id, set_index, weight_kg, reps, completed_at) "
                        + "VALUES (?, ?, 1, 501, 5, now())",
                UUID.randomUUID(), workoutExerciseId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void pozwalaNaDrugiWpisWagiTegoDniaPoSoftDeletecieBoledniego() {
        UUID userId = utworzUzytkownika();

        UUID first = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO body_weights (id, user_id, measured_on, weight_kg) VALUES (?, ?, '2026-09-14', 82.50)",
                first, userId);

        // Drugi wpis tego samego dnia, bez usunięcia pierwszego -- musi odpaść
        // na częściowym unikalnym indeksie (jeden żywy wpis na dzień).
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO body_weights (id, user_id, measured_on, weight_kg) VALUES (?, ?, '2026-09-14', 83.00)",
                UUID.randomUUID(), userId))
                .isInstanceOf(DataIntegrityViolationException.class);

        jdbcTemplate.update("UPDATE body_weights SET deleted_at = now() WHERE id = ?", first);

        UUID second = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO body_weights (id, user_id, measured_on, weight_kg) VALUES (?, ?, '2026-09-14', 83.00)",
                second, userId);

        Integer liveCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM body_weights WHERE user_id = ? AND measured_on = '2026-09-14' AND deleted_at IS NULL",
                Integer.class, userId);

        assertThat(liveCount).isEqualTo(1);
    }

    private UUID utworzUzytkownika() {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, login, password_hash) VALUES (?, ?, 'bcrypt-hash')",
                id, "user-" + id);
        return id;
    }

    private UUID utworzTrening(UUID userId) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO workouts (id, user_id, started_at) VALUES (?, ?, now())",
                id, userId);
        return id;
    }

    private UUID utworzWorkoutExercise(UUID workoutId) {
        UUID id = UUID.randomUUID();
        // 00000000-0000-0000-0000-000000000001 = "Wyciskanie sztangi na ławce płaskiej" z seeda
        jdbcTemplate.update(
                "INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index) "
                        + "VALUES (?, ?, '00000000-0000-0000-0000-000000000001', 1)",
                id, workoutId);
        return id;
    }

}
