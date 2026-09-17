package com.example.easygymbackend.bodyweight;

import com.example.easygymbackend.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BodyWeightApiTest extends ApiIntegrationTest {

    @Test
    void drugiWpisTegoSamegoDniaEdytujeIstniejacy() throws Exception {
        MvcResult first = mockMvc.perform(asJson(put("/api/body-weights"), userA, Map.of(
                        "measuredOn", "2026-09-01", "weightKg", "80.50")))
                .andExpect(status().isOk())
                .andReturn();
        String firstId = objectMapper.readTree(first.getResponse().getContentAsString()).get("id").asString();

        mockMvc.perform(asJson(put("/api/body-weights"), userA, Map.of(
                        "id", UUID.randomUUID(), "measuredOn", "2026-09-01", "weightKg", "81.00")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(firstId))
                .andExpect(jsonPath("$.weightKg").value(81.00));

        Integer live = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM body_weights WHERE user_id = ? AND deleted_at IS NULL",
                Integer.class, userA.id());
        assertThat(live).isEqualTo(1);
    }

    @Test
    void poMiekkimUsunieciuMoznaDodacWpisTegoSamegoDnia() throws Exception {
        MvcResult created = mockMvc.perform(asJson(put("/api/body-weights"), userA, Map.of(
                        "measuredOn", "2026-09-01", "weightKg", "80.50")))
                .andExpect(status().isOk())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asString();

        mockMvc.perform(as(delete("/api/body-weights/" + id), userA)).andExpect(status().isNoContent());
        mockMvc.perform(asJson(put("/api/body-weights"), userA, Map.of(
                        "measuredOn", "2026-09-01", "weightKg", "79.90")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.not(id)));

        mockMvc.perform(as(get("/api/body-weights"), userA))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].weightKg").value(79.90));
    }

    @Test
    void liczySrednieTygodnioweWTygodniachIso() throws Exception {
        // 2026-08-31 to poniedziałek, 2026-09-06 niedziela -- jeden tydzień ISO.
        save(userA, "2026-08-31", "80.00");
        save(userA, "2026-09-02", "80.60");
        save(userA, "2026-09-06", "81.40");
        // Kolejny tydzień, jeden pomiar -> oznaczony jako niepełny.
        save(userA, "2026-09-07", "81.00");

        MvcResult result = mockMvc.perform(as(get("/api/body-weights/stats"), userA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weekly.length()").value(2))
                .andExpect(jsonPath("$.weekly[0].measurementCount").value(3))
                .andExpect(jsonPath("$.weekly[0].averageKg").value(80.67))
                .andExpect(jsonPath("$.weekly[0].incomplete").value(false))
                .andExpect(jsonPath("$.weekly[0].from").value("2026-08-31"))
                .andExpect(jsonPath("$.weekly[0].to").value("2026-09-06"))
                .andExpect(jsonPath("$.weekly[1].incomplete").value(true))
                .andExpect(jsonPath("$.latest.weightKg").value(81.00))
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("weekly").get(1).get("deltaKg").asDouble()).isEqualTo(0.33);
        assertThat(body.get("rollingSevenDay").size()).isEqualTo(4);
    }

    @Test
    void odrzucaWageSpozaZakresu() throws Exception {
        mockMvc.perform(asJson(put("/api/body-weights"), userA, Map.of(
                        "measuredOn", "2026-09-01", "weightKg", "401.00")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nieUjawniaAniNieUsuwaWpisowInnegoUsera() throws Exception {
        MvcResult created = mockMvc.perform(asJson(put("/api/body-weights"), userA, Map.of(
                        "measuredOn", "2026-09-01", "weightKg", "80.50")))
                .andExpect(status().isOk())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asString();

        mockMvc.perform(as(get("/api/body-weights"), userB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(as(delete("/api/body-weights/" + id), userB)).andExpect(status().isNotFound());

        // Ten sam dzień u userB to osobny wpis, nie konflikt z wpisem userA.
        mockMvc.perform(asJson(put("/api/body-weights"), userB, Map.of(
                        "measuredOn", "2026-09-01", "weightKg", "95.00")))
                .andExpect(status().isOk());
        mockMvc.perform(as(get("/api/body-weights"), userA))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].weightKg").value(80.50));
    }

    private void save(TestUser user, String measuredOn, String weightKg) throws Exception {
        mockMvc.perform(asJson(put("/api/body-weights"), user, Map.of(
                        "measuredOn", measuredOn, "weightKg", weightKg)))
                .andExpect(status().isOk());
    }

}
