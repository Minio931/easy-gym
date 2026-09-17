package com.example.easygymbackend.sync;

import com.example.easygymbackend.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SyncApiTest extends ApiIntegrationTest {

    private static final UUID BENCH_PRESS = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Test
    void przyjmujeCalyTreningZKolejkiOfflineIOddajeGoPrzyNastepnymPull() throws Exception {
        UUID workoutId = UUID.randomUUID();
        UUID workoutExerciseId = UUID.randomUUID();
        UUID setId = UUID.randomUUID();

        MvcResult push = sync(userA, null, Map.of(
                        "workouts", List.of(workout(workoutId, "2026-09-01T16:00:00Z", "2026-09-01T17:00:00Z")),
                        "workoutExercises", List.of(workoutExercise(workoutExerciseId, workoutId, BENCH_PRESS)),
                        "sets", List.of(setAt(setId, workoutExerciseId, "100.00", 5, "2026-09-01T16:10:00Z")),
                        "bodyWeights", List.of(bodyWeight(UUID.randomUUID(), "2026-09-01", "80.50",
                                "2026-09-01T07:00:00Z"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied.workouts").value(1))
                .andExpect(jsonPath("$.applied.sets").value(1))
                .andExpect(jsonPath("$.rejected.length()").value(0))
                .andReturn();

        String serverTime = objectMapper.readTree(push.getResponse().getContentAsString())
                .get("serverTime").asString();

        // Drugie urządzenie tego samego konta, pierwszy zaciąg (since = null):
        // widzi cały trening plus katalog globalny.
        sync(userA, null, Map.of())
                .andExpect(jsonPath("$.changes.workouts.length()").value(1))
                .andExpect(jsonPath("$.changes.workoutExercises.length()").value(1))
                .andExpect(jsonPath("$.changes.sets[0].weightKg").value(100.00))
                .andExpect(jsonPath("$.changes.exercises.length()").value(60));

        // To samo urządzenie po synchronizacji: nic nowego.
        sync(userA, serverTime, Map.of())
                .andExpect(jsonPath("$.changes.workouts.length()").value(0))
                .andExpect(jsonPath("$.changes.sets.length()").value(0));
    }

    @Test
    void rozstrzygaKonfliktPoUpdatedAtIOddajeWersjeSerwerowa() throws Exception {
        UUID workoutId = UUID.randomUUID();
        UUID workoutExerciseId = UUID.randomUUID();
        UUID setId = UUID.randomUUID();

        sync(userA, null, Map.of(
                        "workouts", List.of(workout(workoutId, "2026-09-01T16:00:00Z", null)),
                        "workoutExercises", List.of(workoutExercise(workoutExerciseId, workoutId, BENCH_PRESS)),
                        "sets", List.of(setAt(setId, workoutExerciseId, "100.00", 5, "2026-09-01T17:00:00Z"))))
                .andExpect(status().isOk());

        // Starsza wersja tej samej serii (telefon, który był offline) przegrywa...
        sync(userA, null, Map.of(
                        "sets", List.of(setAt(setId, workoutExerciseId, "200.00", 5, "2026-09-01T16:00:00Z"))))
                .andExpect(jsonPath("$.applied.sets").doesNotExist())
                .andExpect(jsonPath("$.rejected[0].table").value("sets"))
                .andExpect(jsonPath("$.rejected[0].reason")
                        .value(org.hamcrest.Matchers.containsString("last-write-wins")))
                // ...i dostaje z powrotem wersję serwera, żeby się z nią zbiegł.
                .andExpect(jsonPath("$.changes.sets[?(@.id == '" + setId + "')].weightKg")
                        .value(org.hamcrest.Matchers.contains(100.00)));

        // Nowsza wersja wygrywa.
        sync(userA, null, Map.of(
                        "sets", List.of(setAt(setId, workoutExerciseId, "110.00", 5, "2026-09-01T18:00:00Z"))))
                .andExpect(jsonPath("$.applied.sets").value(1));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT weight_kg FROM sets WHERE id = ?", java.math.BigDecimal.class, setId))
                .isEqualByComparingTo("110.00");
    }

    @Test
    void odrzucaRekordyNalezaceDoInnegoKonta() throws Exception {
        UUID workoutId = UUID.randomUUID();
        sync(userA, null, Map.of("workouts", List.of(workout(workoutId, "2026-09-01T16:00:00Z", null))))
                .andExpect(status().isOk());

        // userB próbuje nadpisać trening userA tym samym UUID...
        sync(userB, null, Map.of("workouts", List.of(workout(workoutId, "2020-01-01T00:00:00Z", null))))
                .andExpect(jsonPath("$.rejected[0].reason").value("rekord należy do innego konta"))
                .andExpect(jsonPath("$.changes.workouts.length()").value(0));

        // ...i dopiąć do niego swoje ćwiczenie.
        sync(userB, null, Map.of(
                        "workoutExercises", List.of(
                                workoutExercise(UUID.randomUUID(), workoutId, BENCH_PRESS))))
                .andExpect(jsonPath("$.rejected[0].reason")
                        .value(org.hamcrest.Matchers.containsString("należy do innego konta")));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT user_id FROM workouts WHERE id = ?", UUID.class, workoutId))
                .isEqualTo(userA.id());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM workout_exercises WHERE workout_id = ?", Integer.class, workoutId))
                .isZero();
    }

    @Test
    void rozstrzygaKonfliktJednegoWpisuWagiNaDzien() throws Exception {
        UUID older = UUID.randomUUID();
        UUID newer = UUID.randomUUID();

        sync(userA, null, Map.of("bodyWeights", List.of(
                        bodyWeight(older, "2026-09-01", "80.00", "2026-09-01T07:00:00Z"))))
                .andExpect(jsonPath("$.applied.bodyWeights").value(1));

        sync(userA, null, Map.of("bodyWeights", List.of(
                        bodyWeight(newer, "2026-09-01", "81.00", "2026-09-01T08:00:00Z"))))
                .andExpect(jsonPath("$.applied.bodyWeights").value(1))
                // Przegrany wpis wraca jako tombstone, więc drugie urządzenie go skasuje.
                .andExpect(jsonPath("$.rejected[0].id").value(older.toString()))
                .andExpect(jsonPath("$.changes.bodyWeights[?(@.id == '" + older + "')].deletedAt")
                        .value(org.hamcrest.Matchers.hasSize(1)));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM body_weights WHERE user_id = ? AND deleted_at IS NULL",
                Integer.class, userA.id()))
                .isEqualTo(1);
    }

    @Test
    void przyjmujeTombstoneSeriiUsunietejOffline() throws Exception {
        UUID workoutId = UUID.randomUUID();
        UUID workoutExerciseId = UUID.randomUUID();
        UUID setId = UUID.randomUUID();

        sync(userA, null, Map.of(
                        "workouts", List.of(workout(workoutId, "2026-09-01T16:00:00Z", null)),
                        "workoutExercises", List.of(workoutExercise(workoutExerciseId, workoutId, BENCH_PRESS)),
                        "sets", List.of(setAt(setId, workoutExerciseId, "100.00", 5, "2026-09-01T17:00:00Z"))))
                .andExpect(status().isOk());

        Map<String, Object> tombstone = new HashMap<>(
                setAt(setId, workoutExerciseId, "100.00", 5, "2026-09-01T18:00:00Z"));
        tombstone.put("deletedAt", "2026-09-01T18:00:00Z");

        sync(userA, null, Map.of("sets", List.of(tombstone)))
                .andExpect(jsonPath("$.applied.sets").value(1))
                .andExpect(jsonPath("$.changes.sets[?(@.id == '" + setId + "')].deletedAt")
                        .value(org.hamcrest.Matchers.hasSize(1)));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM sets WHERE id = ? AND deleted_at IS NOT NULL", Integer.class, setId))
                .isEqualTo(1);
    }

    @Test
    void odrzucaPojedynczaZlaSerieNieWywracajacCalejPaczki() throws Exception {
        UUID workoutId = UUID.randomUUID();
        UUID workoutExerciseId = UUID.randomUUID();

        MvcResult result = sync(userA, null, Map.of(
                        "workouts", List.of(workout(workoutId, "2026-09-01T16:00:00Z", null)),
                        "workoutExercises", List.of(workoutExercise(workoutExerciseId, workoutId, BENCH_PRESS)),
                        "sets", List.of(
                                setAt(UUID.randomUUID(), workoutExerciseId, "600.00", 5, "2026-09-01T17:00:00Z"),
                                setAt(UUID.randomUUID(), workoutExerciseId, "100.00", 5, "2026-09-01T17:05:00Z"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applied.sets").value(1))
                .andExpect(jsonPath("$.rejected.length()").value(1))
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("rejected").get(0).get("reason").asString()).contains("0-500 kg");
    }

    /* Pomocnicze ------------------------------------------------------- */

    private org.springframework.test.web.servlet.ResultActions sync(
            TestUser user, String since, Map<String, Object> changes) throws Exception {
        Map<String, Object> request = new HashMap<>();
        request.put("since", since);
        request.put("changes", changes);
        return mockMvc.perform(asJson(post("/api/sync"), user, request));
    }

    private static Map<String, Object> workout(UUID id, String startedAt, String endedAt) {
        Map<String, Object> record = new HashMap<>();
        record.put("id", id);
        record.put("startedAt", startedAt);
        record.put("endedAt", endedAt);
        record.put("isDeload", false);
        record.put("updatedAt", startedAt);
        return record;
    }

    private static Map<String, Object> workoutExercise(UUID id, UUID workoutId, UUID exerciseId) {
        Map<String, Object> record = new HashMap<>();
        record.put("id", id);
        record.put("workoutId", workoutId);
        record.put("exerciseId", exerciseId);
        record.put("orderIndex", 0);
        record.put("updatedAt", "2026-09-01T16:05:00Z");
        return record;
    }

    private static Map<String, Object> setAt(
            UUID id, UUID workoutExerciseId, String weightKg, int reps, String updatedAt) {
        Map<String, Object> record = new HashMap<>();
        record.put("id", id);
        record.put("workoutExerciseId", workoutExerciseId);
        record.put("setIndex", 0);
        record.put("weightKg", weightKg);
        record.put("reps", reps);
        record.put("isWarmup", false);
        record.put("assisted", false);
        record.put("completedAt", "2026-09-01T16:10:00Z");
        record.put("updatedAt", updatedAt);
        return record;
    }

    private static Map<String, Object> bodyWeight(UUID id, String measuredOn, String weightKg, String updatedAt) {
        Map<String, Object> record = new HashMap<>();
        record.put("id", id);
        record.put("measuredOn", measuredOn);
        record.put("weightKg", weightKg);
        record.put("updatedAt", updatedAt);
        return record;
    }

}
