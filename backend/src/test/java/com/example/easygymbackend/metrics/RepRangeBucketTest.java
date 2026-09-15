package com.example.easygymbackend.metrics;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RepRangeBucketTest {

    @Test
    void mapujeGraniceZakresowPoprawnie() {
        assertThat(RepRangeBucket.fromReps(1)).isEqualTo(RepRangeBucket.ONE);
        assertThat(RepRangeBucket.fromReps(2)).isEqualTo(RepRangeBucket.TWO_TO_THREE);
        assertThat(RepRangeBucket.fromReps(3)).isEqualTo(RepRangeBucket.TWO_TO_THREE);
        assertThat(RepRangeBucket.fromReps(4)).isEqualTo(RepRangeBucket.FOUR_TO_SIX);
        assertThat(RepRangeBucket.fromReps(6)).isEqualTo(RepRangeBucket.FOUR_TO_SIX);
        assertThat(RepRangeBucket.fromReps(7)).isEqualTo(RepRangeBucket.SEVEN_TO_TEN);
        assertThat(RepRangeBucket.fromReps(10)).isEqualTo(RepRangeBucket.SEVEN_TO_TEN);
        assertThat(RepRangeBucket.fromReps(11)).isEqualTo(RepRangeBucket.ELEVEN_TO_FIFTEEN);
        assertThat(RepRangeBucket.fromReps(15)).isEqualTo(RepRangeBucket.ELEVEN_TO_FIFTEEN);
        assertThat(RepRangeBucket.fromReps(16)).isEqualTo(RepRangeBucket.FIFTEEN_PLUS);
        assertThat(RepRangeBucket.fromReps(100)).isEqualTo(RepRangeBucket.FIFTEEN_PLUS);
    }

}
