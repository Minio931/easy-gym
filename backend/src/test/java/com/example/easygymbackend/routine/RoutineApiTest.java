package com.example.easygymbackend.routine;

import com.example.easygymbackend.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RoutineApiTest extends ApiIntegrationTest {

    private static final UUID BENCH_PRESS = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID DEADLIFT = UUID.fromString("00000000-0000-0000-0000-000000000009");

    @Test
    void zapisujeSzablonZPozycjamiIPodmieniaJePrzyAktualizacji() throws Exception {
        UUID routineId = UUID.randomUUID();
        UUID keptItem = UUID.randomUUID();
        UUID droppedItem = UUID.randomUUID();

        mockMvc.perform(asJson(post("/api/routines"), userA, Map.of(
                        "id", routineId,
                        "name", "Push A",
                        "items", List.of(
                                Map.of("id", keptItem, "exerciseId", BENCH_PRESS, "orderIndex", 0,
                                        "targetSets", 4, "targetReps", 6),
                                Map.of("id", droppedItem, "exerciseId", DEADLIFT, "orderIndex", 1)))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.items.length()").value(2));

        mockMvc.perform(asJson(put("/api/routines/" + routineId), userA, Map.of(
                        "name", "Push A (v2)",
                        "items", List.of(
                                Map.of("id", keptItem, "exerciseId", BENCH_PRESS, "orderIndex", 0,
                                        "targetSets", 5, "targetReps", 5)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Push A (v2)"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].targetSets").value(5));

        // Usunięta pozycja zostaje jako tombstone, żeby zniknęła też na drugim urządzeniu.
        Integer tombstoned = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM routine_items WHERE id = ? AND deleted_at IS NOT NULL",
                Integer.class, droppedItem);
        assertThat(tombstoned).isEqualTo(1);
    }

    @Test
    void rozpoczynaTreningZSzablonuKopiujacPozycje() throws Exception {
        UUID routineId = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/routines"), userA, Map.of(
                        "id", routineId,
                        "name", "Full body",
                        "items", List.of(
                                Map.of("exerciseId", BENCH_PRESS, "orderIndex", 0),
                                Map.of("exerciseId", DEADLIFT, "orderIndex", 1)))))
                .andExpect(status().isCreated());

        mockMvc.perform(asJson(post("/api/workouts"), userA, Map.of(
                        "startedAt", "2026-09-01T16:00:00Z", "routineId", routineId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.exercises.length()").value(2))
                .andExpect(jsonPath("$.exercises[0].exerciseId").value(BENCH_PRESS.toString()))
                .andExpect(jsonPath("$.exercises[1].exerciseName")
                        .value(org.hamcrest.Matchers.containsString("Martwy ciąg")));

        // applyRoutine=false: trening wie, z jakiego szablonu powstał, ale zaczyna pusty.
        mockMvc.perform(asJson(post("/api/workouts"), userA, Map.of(
                        "startedAt", "2026-09-02T16:00:00Z",
                        "routineId", routineId,
                        "applyRoutine", false)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.exercises.length()").value(0))
                .andExpect(jsonPath("$.routineId").value(routineId.toString()));
    }

    @Test
    void nieUjawniaAniNieUzywaSzablonuInnegoUsera() throws Exception {
        UUID routineId = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/routines"), userA, Map.of(
                        "id", routineId, "name", "Prywatny", "items", List.of())))
                .andExpect(status().isCreated());

        mockMvc.perform(as(get("/api/routines"), userB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(as(get("/api/routines/" + routineId), userB)).andExpect(status().isNotFound());
        mockMvc.perform(asJson(put("/api/routines/" + routineId), userB, Map.of(
                        "name", "Przejęty", "items", List.of())))
                .andExpect(status().isNotFound());
        mockMvc.perform(as(delete("/api/routines/" + routineId), userB)).andExpect(status().isNotFound());

        // Nie da się też zacząć treningu z cudzego szablonu.
        mockMvc.perform(asJson(post("/api/workouts"), userB, Map.of(
                        "startedAt", "2026-09-01T16:00:00Z", "routineId", routineId)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void odrzucaPozycjeZCwiczeniemInnegoKonta() throws Exception {
        UUID foreignExercise = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/exercises"), userB, Map.of(
                        "id", foreignExercise, "name", "Cudze", "muscleGroup", "barki", "equipment", "cable")))
                .andExpect(status().isCreated());

        mockMvc.perform(asJson(post("/api/routines"), userA, Map.of(
                        "name", "Podejrzany",
                        "items", List.of(Map.of("exerciseId", foreignExercise, "orderIndex", 0)))))
                .andExpect(status().isBadRequest());
    }

}
