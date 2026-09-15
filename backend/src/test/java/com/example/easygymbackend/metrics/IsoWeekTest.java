package com.example.easygymbackend.metrics;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Granice tygodnia ISO wprost wymagane przez sekcję 9 promptu: niedziela
 * 23:59, poniedziałek 00:00, przełom roku, tydzień 53. Wszystkie oczekiwane
 * wartości policzone ręcznie z reguły ISO-8601 (tydzień 1 = tydzień z
 * pierwszym czwartkiem stycznia), nie odczytane z implementacji pod testem.
 */
class IsoWeekTest {

    @Test
    void zwyklySrodekTygodnia() {
        // Środa, zwykły tydzień roku -- sanity check bez żadnych granic.
        assertThat(IsoWeek.of(LocalDate.of(2026, 6, 10))).isEqualTo(new IsoWeek(2026, 24));
    }

    @Test
    void przelomRoku2022_2023_NiedzielaNaleyDoOstatniegoTygodniaPoprzedniegoRoku() {
        // 1 stycznia 2023 to niedziela -- należy do tygodnia 52/2022, nie 1/2023.
        assertThat(IsoWeek.of(LocalDate.of(2023, 1, 1))).isEqualTo(new IsoWeek(2022, 52));
        assertThat(IsoWeek.of(LocalDate.of(2022, 12, 31))).isEqualTo(new IsoWeek(2022, 52));
    }

    @Test
    void przelomRoku2025_2026_GrudniowyPoniedzialekNalezyDoTygodnia1NastepnegoRoku() {
        // 1 stycznia 2026 to czwartek -- tydzień go zawierający zaczyna się
        // w poniedziałek 29 grudnia 2025 i to już tydzień 1/2026.
        assertThat(IsoWeek.of(LocalDate.of(2025, 12, 29))).isEqualTo(new IsoWeek(2026, 1));
        assertThat(IsoWeek.of(LocalDate.of(2026, 1, 1))).isEqualTo(new IsoWeek(2026, 1));
        // Niedziela dzień wcześniej to jeszcze ostatni tydzień 2025.
        assertThat(IsoWeek.of(LocalDate.of(2025, 12, 28))).isEqualTo(new IsoWeek(2025, 52));
    }

    @Test
    void tydzien53Istnieje2020RokIStycznioweDniLeza2021WciazWTygodniu53Roku2020() {
        // 2020: Jan 1 = środa + rok przestępny -> ma 53 tygodnie.
        assertThat(IsoWeek.of(LocalDate.of(2020, 12, 31))).isEqualTo(new IsoWeek(2020, 53));
        // 1 stycznia 2021 (piątek) wciąż w tygodniu 53/2020, nie w tygodniu 1/2021.
        assertThat(IsoWeek.of(LocalDate.of(2021, 1, 1))).isEqualTo(new IsoWeek(2020, 53));
        assertThat(IsoWeek.of(LocalDate.of(2021, 1, 3))).isEqualTo(new IsoWeek(2020, 53));
        assertThat(IsoWeek.of(LocalDate.of(2021, 1, 4))).isEqualTo(new IsoWeek(2021, 1));
    }

    @Test
    void mondayStartISundayEndDajaSpojnyRoundtrip() {
        IsoWeek week53_2020 = new IsoWeek(2020, 53);
        assertThat(week53_2020.mondayStart()).isEqualTo(LocalDate.of(2020, 12, 28));
        assertThat(week53_2020.sundayEnd()).isEqualTo(LocalDate.of(2021, 1, 3));
        assertThat(IsoWeek.of(week53_2020.mondayStart())).isEqualTo(week53_2020);
        assertThat(IsoWeek.of(week53_2020.sundayEnd())).isEqualTo(week53_2020);

        IsoWeek week1_2026 = new IsoWeek(2026, 1);
        assertThat(week1_2026.mondayStart()).isEqualTo(LocalDate.of(2025, 12, 29));
        assertThat(IsoWeek.of(week1_2026.mondayStart())).isEqualTo(week1_2026);
    }

    @Test
    void granicaPolnocyWarszawaWiosennaZmianaCzasu() {
        // Ostatnia niedziela marca 2026 (29.03) -- zegary w Warszawie 2:00->3:00 CEST.
        // 23:30 lokalnie w niedzielę (jeszcze CEST +2) = 21:30 UTC.
        Instant sundayLateNight = Instant.parse("2026-03-29T21:30:00Z");
        // 00:30 lokalnie w poniedziałek (już nowy tydzień) = 22:30 UTC tego samego dnia UTC.
        Instant mondayJustAfterMidnight = Instant.parse("2026-03-29T22:30:00Z");

        IsoWeek weekBefore = IsoWeek.ofInstant(sundayLateNight);
        IsoWeek weekAfter = IsoWeek.ofInstant(mondayJustAfterMidnight);

        assertThat(weekAfter).isNotEqualTo(weekBefore);
        assertThat(weekAfter.mondayStart()).isEqualTo(LocalDate.of(2026, 3, 30));
    }

    @Test
    void granicaPolnocyWarszawaJesiennaZmianaCzasu() {
        // Ostatnia niedziela października 2026 (25.10) -- zegary 3:00->2:00 CET.
        // 23:30 lokalnie w niedzielę (już CET +1) = 22:30 UTC.
        Instant sundayLateNight = Instant.parse("2026-10-25T22:30:00Z");
        // 00:30 lokalnie w poniedziałek (CET +1) = 23:30 UTC tego samego dnia UTC.
        Instant mondayJustAfterMidnight = Instant.parse("2026-10-25T23:30:00Z");

        IsoWeek weekBefore = IsoWeek.ofInstant(sundayLateNight);
        IsoWeek weekAfter = IsoWeek.ofInstant(mondayJustAfterMidnight);

        assertThat(weekAfter).isNotEqualTo(weekBefore);
        assertThat(weekAfter.mondayStart()).isEqualTo(LocalDate.of(2026, 10, 26));
    }

    @Test
    void porzadkowanieChronologiczneDzialaPrzezRokIPrzezTydzien53() {
        IsoWeek week52_2022 = new IsoWeek(2022, 52);
        IsoWeek week53_2020 = new IsoWeek(2020, 53);
        IsoWeek week1_2021 = new IsoWeek(2021, 1);

        assertThat(week53_2020).isLessThan(week1_2021);
        assertThat(week1_2021).isLessThan(week52_2022);
    }

}
