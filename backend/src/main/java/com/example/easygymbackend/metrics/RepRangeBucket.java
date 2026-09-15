package com.example.easygymbackend.metrics;

/** Zakresy powtórzeń pod PR per zakres, dokładnie jak w sekcji 4 promptu. */
public enum RepRangeBucket {
    ONE,
    TWO_TO_THREE,
    FOUR_TO_SIX,
    SEVEN_TO_TEN,
    ELEVEN_TO_FIFTEEN,
    FIFTEEN_PLUS;

    public static RepRangeBucket fromReps(int reps) {
        if (reps == 1) {
            return ONE;
        }
        if (reps <= 3) {
            return TWO_TO_THREE;
        }
        if (reps <= 6) {
            return FOUR_TO_SIX;
        }
        if (reps <= 10) {
            return SEVEN_TO_TEN;
        }
        if (reps <= 15) {
            return ELEVEN_TO_FIFTEEN;
        }
        return FIFTEEN_PLUS;
    }
}
