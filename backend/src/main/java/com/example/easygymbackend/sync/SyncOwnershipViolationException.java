package com.example.easygymbackend.sync;

/**
 * Rzucany gdy batch synchronizacji odwołuje się (bezpośrednio przez id albo
 * przez referencję typu workoutId/exerciseId/workoutExerciseId) do rekordu
 * należącego do innego usera. Decyzja: cały batch pada (400), nic się nie
 * aplikuje -- @Transactional na SyncService#push rollbackuje wszystko, co
 * ewentualnie zdążyło się zapisać wcześniej w tej samej transakcji.
 */
public class SyncOwnershipViolationException extends RuntimeException {

    public SyncOwnershipViolationException(String message) {
        super(message);
    }

}
