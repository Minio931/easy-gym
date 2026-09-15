package com.example.easygymbackend.export;

import com.example.easygymbackend.workout.dto.AddExerciseRequest;
import com.example.easygymbackend.workout.dto.AddSetRequest;
import com.example.easygymbackend.workout.dto.StartWorkoutRequest;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
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
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Etap 9 -- eksport XLSX. Plik wygenerowany przez endpoint jest odczytywany
 * z powrotem przez POI, nie tylko sprawdzany po kodzie HTTP -- błędy w
 * budowaniu arkusza (zły indeks kolumny, zepsuta formuła nazwanego zakresu,
 * wyjątek przy tworzeniu wykresu) nie ujawniłyby się inaczej.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ExportFlowTest {

    private static final UUID GLOBAL_EXERCISE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
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
        jdbcTemplate.update("DELETE FROM body_weights");
        jdbcTemplate.update("DELETE FROM sets");
        jdbcTemplate.update("DELETE FROM workout_exercises");
        jdbcTemplate.update("DELETE FROM workouts");
        jdbcTemplate.update("DELETE FROM exercises WHERE user_id IS NOT NULL");
        jdbcTemplate.update("DELETE FROM refresh_tokens");
        jdbcTemplate.update("DELETE FROM users WHERE login IN ('export-user-a', 'export-user-b')");

        seedUser("export-user-a");
        seedUser("export-user-b");
        userAToken = login("export-user-a");
        userBToken = login("export-user-b");
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

    private void logWorkoutWithTwoSets(String token) throws Exception {
        String workoutResponse = mockMvc.perform(post("/api/workouts")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new StartWorkoutRequest(UUID.randomUUID(), null, "trening testowy", false))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID workoutId = UUID.fromString(objectMapper.readTree(workoutResponse).get("id").asString());
        jdbcTemplate.update("UPDATE workouts SET started_at = ?, ended_at = ? WHERE id = ?",
                java.sql.Timestamp.from(Instant.parse("2026-06-08T10:00:00Z")),
                java.sql.Timestamp.from(Instant.parse("2026-06-08T11:00:00Z")),
                workoutId);

        String weResponse = mockMvc.perform(post("/api/workouts/" + workoutId + "/exercises")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new AddExerciseRequest(UUID.randomUUID(), GLOBAL_EXERCISE_ID, 1, null))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID workoutExerciseId = UUID.fromString(objectMapper.readTree(weResponse).get("id").asString());

        addSet(token, workoutExerciseId, 1, new BigDecimal("40.00"), 10, true, false);   // rozgrzewka
        addSet(token, workoutExerciseId, 2, new BigDecimal("100.00"), 5, false, false);  // robocza, PR
    }

    private void addSet(String token, UUID workoutExerciseId, int setIndex, BigDecimal weightKg, int reps,
                         boolean warmup, boolean assisted) throws Exception {
        var request = new AddSetRequest(
                UUID.randomUUID(), setIndex, weightKg, reps, null, warmup, false, assisted, Instant.parse("2026-06-08T10:30:00Z"));
        mockMvc.perform(post("/api/workout-exercises/" + workoutExerciseId + "/sets")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());
    }

    private XSSFWorkbook exportWorkbook(String token, String... extraParams) throws Exception {
        var requestBuilder = get("/api/export/xlsx").header("Authorization", "Bearer " + token);
        for (int i = 0; i + 1 < extraParams.length; i += 2) {
            requestBuilder = requestBuilder.param(extraParams[i], extraParams[i + 1]);
        }

        byte[] bytes = mockMvc.perform(requestBuilder)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        return new XSSFWorkbook(new ByteArrayInputStream(bytes));
    }

    @Test
    void zawieraSzescArkuszyOOczekiwanychNazwach() throws Exception {
        logWorkoutWithTwoSets(userAToken);

        try (XSSFWorkbook workbook = exportWorkbook(userAToken)) {
            List<String> sheetNames = new ArrayList<>();
            for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
                sheetNames.add(workbook.getSheetName(i));
            }

            assertThat(sheetNames).containsExactlyInAnyOrder(
                    "Podsumowanie", "Treningi", "Serie", "Progres ćwiczeń", "Waga ciała", "Waga tygodniowo");
        }
    }

    @Test
    void arkuszSerieMaPoprawneNaglowkiIWierszRozgrzewkowyOrazRoboczy() throws Exception {
        logWorkoutWithTwoSets(userAToken);

        try (XSSFWorkbook workbook = exportWorkbook(userAToken)) {
            XSSFSheet sheet = workbook.getSheet("Serie");
            Row header = sheet.getRow(0);

            assertThat(header.getCell(0).getStringCellValue()).isEqualTo("Data");
            assertThat(header.getCell(1).getStringCellValue()).isEqualTo("Ćwiczenie");
            assertThat(header.getCell(12).getStringCellValue()).isEqualTo("PR");

            // Wiersz 1 = rozgrzewka (40kg x10), wiersz 2 = robocza PR (100kg x5) -- kolejnosc chronologiczna po setIndex.
            Row warmupRow = sheet.getRow(1);
            assertThat(warmupRow.getCell(4).getNumericCellValue()).isEqualTo(40.0);
            assertThat(warmupRow.getCell(9).getBooleanCellValue()).isTrue(); // rozgrzewkowa
            assertThat(warmupRow.getCell(12).getBooleanCellValue()).isFalse(); // rozgrzewka nigdy nie jest PR

            Row workingRow = sheet.getRow(2);
            assertThat(workingRow.getCell(4).getNumericCellValue()).isEqualTo(100.0);
            assertThat(workingRow.getCell(12).getBooleanCellValue()).isTrue(); // jedyna robocza seria = PR
        }
    }

    @Test
    void filtrTylkoSerieRoboczeUsuwaRozgrzewkeZArkuszaSerie() throws Exception {
        logWorkoutWithTwoSets(userAToken);

        try (XSSFWorkbook workbook = exportWorkbook(userAToken, "workingSetsOnly", "true")) {
            XSSFSheet sheet = workbook.getSheet("Serie");
            // Nagłówek + tylko 1 wiersz roboczy (rozgrzewka odfiltrowana).
            assertThat(sheet.getLastRowNum()).isEqualTo(1);
        }
    }

    @Test
    void nazwanyZakresSerieDaneIstniejePodPivotTabele() throws Exception {
        logWorkoutWithTwoSets(userAToken);

        try (XSSFWorkbook workbook = exportWorkbook(userAToken)) {
            assertThat(workbook.getName("SerieDane")).isNotNull();
        }
    }

    @Test
    void arkuszTreningiMaWierszZPoprawnaLiczbaSeriiIObjetoscia() throws Exception {
        logWorkoutWithTwoSets(userAToken);

        try (XSSFWorkbook workbook = exportWorkbook(userAToken)) {
            XSSFSheet sheet = workbook.getSheet("Treningi");
            Row dataRow = sheet.getRow(1);

            assertThat(dataRow.getCell(4).getNumericCellValue()).isEqualTo(2); // liczba serii (rozgrzewka + robocza)
            assertThat(dataRow.getCell(5).getNumericCellValue()).isEqualTo(500.0); // objetosc: tylko robocza (100*5)
            assertThat(dataRow.getCell(6).getBooleanCellValue()).isFalse(); // deload
        }
    }

    @Test
    void wykresyPowstajaNaTrzechArkuszach() throws Exception {
        logWorkoutWithTwoSets(userAToken);
        mockMvc.perform(post("/api/body-weights")
                        .header("Authorization", "Bearer " + userAToken)
                        .contentType("application/json")
                        .content("{\"id\":\"" + UUID.randomUUID() + "\",\"measuredOn\":\"2026-06-08\",\"weightKg\":80.0}"))
                .andExpect(status().isCreated());

        try (XSSFWorkbook workbook = exportWorkbook(userAToken)) {
            XSSFSheet summary = workbook.getSheet("Podsumowanie");
            XSSFSheet progress = workbook.getSheet("Progres ćwiczeń");
            XSSFSheet weekly = workbook.getSheet("Waga tygodniowo");

            assertThat(summary.getDrawingPatriarch()).isNotNull();
            assertThat(summary.getDrawingPatriarch().getCharts()).isNotEmpty();
            assertThat(progress.getDrawingPatriarch()).isNotNull();
            assertThat(progress.getDrawingPatriarch().getCharts()).isNotEmpty();
            assertThat(weekly.getDrawingPatriarch()).isNotNull();
            assertThat(weekly.getDrawingPatriarch().getCharts()).isNotEmpty();
        }
    }

    @Test
    void uzytkownikBDostajePustyEksportBezDanychUzytkownikaA() throws Exception {
        logWorkoutWithTwoSets(userAToken);

        try (XSSFWorkbook workbook = exportWorkbook(userBToken)) {
            XSSFSheet sheet = workbook.getSheet("Serie");
            assertThat(sheet.getLastRowNum()).isEqualTo(0); // sam nagłówek, zero wierszy danych
        }
    }

    @Test
    void nagrodekContentTypeIContentDisposition() throws Exception {
        logWorkoutWithTwoSets(userAToken);

        mockMvc.perform(get("/api/export/xlsx").header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getContentType())
                        .isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .andExpect(result -> assertThat(result.getResponse().getHeader("Content-Disposition"))
                        .contains("attachment"));
    }

}
