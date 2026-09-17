package com.example.easygymbackend.exercise;

import com.example.easygymbackend.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ExerciseApiTest extends ApiIntegrationTest {

    private static final UUID GLOBAL_BENCH_PRESS = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Test
    void listaZawieraKatalogGlobalnyIWlasneCwiczenia() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/exercises"), userA, Map.of(
                        "id", id,
                        "name", "Wyciskanie francuskie z gryfem łamanym",
                        "muscleGroup", "triceps",
                        "equipment", "barbell")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.global").value(false))
                .andExpect(jsonPath("$.isArchived").value(false));

        mockMvc.perform(as(get("/api/exercises"), userA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(61))
                .andExpect(jsonPath("$[?(@.id == '" + id + "')].global").value(false));

        // userB widzi tylko katalog globalny -- ćwiczenie userA go nie dotyczy.
        mockMvc.perform(as(get("/api/exercises"), userB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(60));
    }

    @Test
    void szukaPoFragmencieNazwyIPoLiterowce() throws Exception {
        mockMvc.perform(as(get("/api/exercises?query=wyciskanie sztangi"), userA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThan(0)))
                .andExpect(jsonPath("$[0].name").value(org.hamcrest.Matchers.containsString("Wyciskanie sztangi")));
    }

    @Test
    void odmawiaEdycjiCwiczeniaZKatalogGlobalnego() throws Exception {
        mockMvc.perform(asJson(put("/api/exercises/" + GLOBAL_BENCH_PRESS), userA, Map.of(
                        "name", "Moja nazwa",
                        "muscleGroup", "klatka piersiowa",
                        "equipment", "barbell")))
                .andExpect(status().isForbidden());

        mockMvc.perform(as(delete("/api/exercises/" + GLOBAL_BENCH_PRESS), userA))
                .andExpect(status().isForbidden());
    }

    @Test
    void nieUjawniaAniNieModyfikujeCwiczeniaInnegoUsera() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/exercises"), userA, Map.of(
                        "id", id, "name", "Prywatne", "muscleGroup", "barki", "equipment", "cable")))
                .andExpect(status().isCreated());

        mockMvc.perform(as(get("/api/exercises/" + id), userB)).andExpect(status().isNotFound());
        mockMvc.perform(asJson(put("/api/exercises/" + id), userB, Map.of(
                        "name", "Przejęte", "muscleGroup", "barki", "equipment", "cable")))
                .andExpect(status().isNotFound());
        mockMvc.perform(as(delete("/api/exercises/" + id), userB)).andExpect(status().isNotFound());

        // Dane userA nietknięte.
        mockMvc.perform(as(get("/api/exercises/" + id), userA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Prywatne"));
    }

    @Test
    void usuwaMiekkoZeZnacznikiemDeletedAt() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/exercises"), userA, Map.of(
                        "id", id, "name", "Do skasowania", "muscleGroup", "nogi", "equipment", "machine")))
                .andExpect(status().isCreated());

        mockMvc.perform(as(delete("/api/exercises/" + id), userA)).andExpect(status().isNoContent());

        Integer live = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exercises WHERE id = ? AND deleted_at IS NULL", Integer.class, id);
        Integer tombstoned = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM exercises WHERE id = ? AND deleted_at IS NOT NULL", Integer.class, id);

        assertThat(live).isZero();
        assertThat(tombstoned).isEqualTo(1);
        mockMvc.perform(as(get("/api/exercises/" + id), userA)).andExpect(status().isNotFound());
    }

    @Test
    void odrzucaNieznanyTypSprzetuZBledem400() throws Exception {
        mockMvc.perform(asJson(post("/api/exercises"), userA, Map.of(
                        "name", "Kettlebell swing", "muscleGroup", "nogi", "equipment", "kettlebell")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("kettlebell")));
    }

    @Test
    void wymagaUwierzytelnienia() throws Exception {
        mockMvc.perform(get("/api/exercises")).andExpect(status().isUnauthorized());
    }

}
