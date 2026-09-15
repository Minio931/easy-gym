package com.example.easygymbackend.metrics;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class OneRepMaxTest {

    @Test
    void epleyDlaJednegoPowtorzeniaZwracaSamaWage() {
        Optional<BigDecimal> result = OneRepMax.estimate(BigDecimal.valueOf(100), 1, OneRepMaxFormula.EPLEY);

        assertThat(result).contains(BigDecimal.valueOf(100).setScale(2));
    }

    @Test
    void brzyckiDlaJednegoPowtorzeniaZwracaSamaWage() {
        Optional<BigDecimal> result = OneRepMax.estimate(BigDecimal.valueOf(100), 1, OneRepMaxFormula.BRZYCKI);

        assertThat(result).contains(BigDecimal.valueOf(100).setScale(2));
    }

    @Test
    void epleyLiczyZgodnieZeWzorem() {
        // 100 * (1 + 5/30) = 116.666... -> 116.67
        Optional<BigDecimal> result = OneRepMax.estimate(BigDecimal.valueOf(100), 5, OneRepMaxFormula.EPLEY);

        assertThat(result).contains(new BigDecimal("116.67"));
    }

    @Test
    void brzyckiLiczyZgodnieZeWzorem() {
        // 100 * 36 / (37-10) = 133.333... -> 133.33
        Optional<BigDecimal> result = OneRepMax.estimate(BigDecimal.valueOf(100), 10, OneRepMaxFormula.BRZYCKI);

        assertThat(result).contains(new BigDecimal("133.33"));
    }

    @Test
    void brzyckiNaGranicyTrzydziestuSzesciuPowtorzenJeszczeDziala() {
        // 37 - 36 = 1, wciaz zdefiniowane (ekstremalne, ale nie zero/ujemne)
        Optional<BigDecimal> result = OneRepMax.estimate(BigDecimal.valueOf(10), 36, OneRepMaxFormula.BRZYCKI);

        assertThat(result).contains(new BigDecimal("360.00"));
    }

    @Test
    void brzyckiDzieliPrzezZeroPrzyTrzydziestuSiedmiuPowtorzeniach() {
        Optional<BigDecimal> result = OneRepMax.estimate(BigDecimal.valueOf(10), 37, OneRepMaxFormula.BRZYCKI);

        assertThat(result).isEmpty();
    }

    @Test
    void brzyckiDajeUjemnyWynikPowyzejTrzydziestuSiedmiuWiecOdrzucamy() {
        // Realny przypadek: pompki (bodyweight) do odmowy (to_failure), 40 powt.
        Optional<BigDecimal> result = OneRepMax.estimate(BigDecimal.valueOf(70), 40, OneRepMaxFormula.BRZYCKI);

        assertThat(result).isEmpty();
    }

    @Test
    void epleyNieMaGranicyIDzialaTezPowyzejTrzydziestuSiedmiuPowtorzen() {
        Optional<BigDecimal> result = OneRepMax.estimate(BigDecimal.valueOf(70), 40, OneRepMaxFormula.EPLEY);

        assertThat(result).isPresent();
    }

}
