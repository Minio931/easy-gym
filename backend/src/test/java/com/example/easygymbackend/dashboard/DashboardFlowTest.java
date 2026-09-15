package com.example.easygymbackend.dashboard;

import com.example.easygymbackend.workout.dto.AddExerciseRequest;
import com.example.easygymbackend.workout.dto.AddSetRequest;
import com.example.easygymbackend.workout.dto.StartWorkoutRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Etap 8 -- dashboard: SUM/GROUP BY w SQL dla objętości/kalendarza, metrics dla "ostatnich PR". */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class DashboardFlowTest {

    private static final UUID CHEST_EXERCISE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001"); // klatka piersiowa
    private static final UUID LEGS_EXERCISE_ID = UUID.fromString("00000000-0000-0000-0000-000000000017");  // nogi
    private static final String PASSWORD = "correct-horse-battery-staple";

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    private String userAToken;
    private String userBToken;

    @BeforeEach
    void seedUsersAndLogIn() throws Exception {
        jdbcTemplate.update("DELETE FROM sets");
        jdbcTemplate.update("DELETE FROM workout_exercises");
        jdbcTemplate.update("DELETE FROM workouts");
        jdbcTemplate.update("DELETE FROM exercises WHERE user_id IS NOT NULL");
        jdbcTemplate.update("DELETE FROM refresh_tokens");
        jdbcTemplate.update("DELETE FROM users WHERE login IN ('dash-user-a', 'dash-user-b')");

        seedUser("dash-user-a");
        seedUser("dash-user-b");
        userAToken = login("dash-user-a");
        userBToken = login("dash-user-b");
    }

    private void seedUser(String login) {
        jdbcTemplate.update(
                "INSERT INTO users (id, login, password_hash) VALUES (?, ?, ?)",
                UUID.randomUUID(), login, passwordEncoder.encode(PASSWORD));
    }

    private String login(String login) throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"login\":\"" + login + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("accessToken").asString();
    }

    /** Trening w konkretnej chwili (started_at = completedAt pierwszej serii) z jedną serią danego ćwiczenia. */
    private void logWorkout(String token, UUID exerciseId, Instant when, BigDecimal weightKg, int reps,
                             boolean warmup, boolean assisted) throws Exception {
        String workoutResponse = mockMvc.perform(post("/api/workouts")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new StartWorkoutRequest(UUID.randomUUID(), null, null, false))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID workoutId = UUID.fromString(objectMapper.readTree(workoutResponse).get("id").asString());
        // started_at ustawiane bezpośrednio w bazie -- endpoint startowy zawsze bije "teraz",
        // a testy potrzebują kontrolować dokładną datę treningu (bucketing tygodniowy, okno "ostatnie PR").
        jdbcTemplate.update("UPDATE workouts SET started_at = ? WHERE id = ?", java.sql.Timestamp.from(when), workoutId);

        String weResponse = mockMvc.perform(post("/api/workouts/" + workoutId + "/exercises")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new AddExerciseRequest(UUID.randomUUID(), exerciseId, 1, null))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID workoutExerciseId = UUID.fromString(objectMapper.readTree(weResponse).get("id").asString());

        mockMvc.perform(post("/api/workout-exercises/" + workoutExerciseId + "/sets")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new AddSetRequest(UUID.randomUUID(), 1, weightKg, reps, null, warmup, false, assisted, when))))
                .andExpect(status().isCreated());
    }

    private JsonNode getDashboard(String token) throws Exception {
        String response = mockMvc.perform(get("/api/dashboard")
                        .param("from", "2020-01-01")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    @Test
    void objetoscTygodniowaGrupowanaPerMiesienIWykluczaRozgrzewke() throws Exception {
        Instant monday = Instant.parse("2026-06-08T10:00:00Z");
        logWorkout(userAToken, CHEST_EXERCISE_ID, monday, new BigDecimal("100.00"), 5, false, false);   // 500
        logWorkout(userAToken, CHEST_EXERCISE_ID, monday.plus(1, ChronoUnit.DAYS), new BigDecimal("20.00"), 10, true, false); // rozgrzewka, pominieta

        JsonNode volumes = getDashboard(userAToken).get("weeklyVolumeByMuscleGroup");

        assertThat(volumes).hasSize(1);
        assertThat(volumes.get(0).get("muscleGroup").asString()).isEqualTo("klatka piersiowa");
        assertThat(volumes.get(0).get("volumeKg").asDouble()).isEqualTo(500.0);
    }

    @Test
    void objetoscWliczaAssistedZgodnieZDisplayVolumeKg() throws Exception {
        Instant monday = Instant.parse("2026-06-08T10:00:00Z");
        logWorkout(userAToken, CHEST_EXERCISE_ID, monday, new BigDecimal("80.00"), 5, false, true); // 400, assisted

        JsonNode volumes = getDashboard(userAToken).get("weeklyVolumeByMuscleGroup");

        assertThat(volumes.get(0).get("volumeKg").asDouble()).isEqualTo(400.0);
    }

    @Test
    void dwieGrupyMiesniowaOsobnymiSlupkami() throws Exception {
        Instant monday = Instant.parse("2026-06-08T10:00:00Z");
        logWorkout(userAToken, CHEST_EXERCISE_ID, monday, new BigDecimal("100.00"), 5, false, false);
        logWorkout(userAToken, LEGS_EXERCISE_ID, monday, new BigDecimal("140.00"), 5, false, false);

        JsonNode volumes = getDashboard(userAToken).get("weeklyVolumeByMuscleGroup");

        assertThat(volumes).hasSize(2);
    }

    @Test
    void liczbaTreningowWDniuIFlagaDeload() throws Exception {
        Instant day = Instant.parse("2026-06-08T10:00:00Z");
        logWorkout(userAToken, CHEST_EXERCISE_ID, day, new BigDecimal("100.00"), 5, false, false);
        logWorkout(userAToken, LEGS_EXERCISE_ID, day.plus(2, ChronoUnit.HOURS), new BigDecimal("60.00"), 5, false, false);

        JsonNode days = getDashboard(userAToken).get("workoutsByDay");

        assertThat(days).hasSize(1);
        assertThat(days.get(0).get("workoutCount").asInt()).isEqualTo(2);
    }

    @Test
    void ostatniePrPomijaWpisySprzedTrzydziestuDni() throws Exception {
        Instant old = Instant.now().minus(60, ChronoUnit.DAYS);
        Instant recent = Instant.now().minus(2, ChronoUnit.DAYS);

        logWorkout(userAToken, CHEST_EXERCISE_ID, old, new BigDecimal("90.00"), 5, false, false);
        logWorkout(userAToken, CHEST_EXERCISE_ID, recent, new BigDecimal("100.00"), 5, false, false);

        JsonNode recentPrs = getDashboard(userAToken).get("recentPersonalRecords");

        assertThat(recentPrs).anyMatch(pr -> pr.get("category").asString().equals("MAX_WEIGHT")
                && pr.get("value").asDouble() == 100.0);
    }

    @Test
    void staryRekordBezNowszejPobitejWartosciNieWchodzone() throws Exception {
        Instant old = Instant.now().minus(60, ChronoUnit.DAYS);
        logWorkout(userAToken, CHEST_EXERCISE_ID, old, new BigDecimal("90.00"), 5, false, false);

        JsonNode recentPrs = getDashboard(userAToken).get("recentPersonalRecords");

        assertThat(recentPrs).noneMatch(pr -> pr.get("category").asString().equals("MAX_WEIGHT"));
    }

    @Test
    void uzytkownikBNieWidziDashboarduUzytkownikaA() throws Exception {
        Instant monday = Instant.parse("2026-06-08T10:00:00Z");
        logWorkout(userAToken, CHEST_EXERCISE_ID, monday, new BigDecimal("100.00"), 5, false, false);

        JsonNode dashboardForB = getDashboard(userBToken);

        assertThat(dashboardForB.get("weeklyVolumeByMuscleGroup")).isEmpty();
        assertThat(dashboardForB.get("workoutsByDay")).isEmpty();
        assertThat(dashboardForB.get("recentPersonalRecords")).isEmpty();
    }

}
