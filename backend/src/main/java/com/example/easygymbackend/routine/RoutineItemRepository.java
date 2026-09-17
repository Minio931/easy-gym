package com.example.easygymbackend.routine;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface RoutineItemRepository extends JpaRepository<RoutineItem, UUID> {

    List<RoutineItem> findByRoutineIdAndDeletedAtIsNullOrderByOrderIndexAsc(UUID routineId);

    List<RoutineItem> findByRoutineIdInAndDeletedAtIsNullOrderByOrderIndexAsc(Collection<UUID> routineIds);

    /** Zakres usera przez rodzica -- routine_items nie ma własnej kolumny user_id. */
    @Query("""
            select ri from RoutineItem ri
            where ri.updatedAt > :since
              and ri.routineId in (select r.id from Routine r where r.userId = :userId)
            """)
    List<RoutineItem> findChangedSince(@Param("userId") UUID userId, @Param("since") Instant since);

    @Query("""
            select ri from RoutineItem ri
            where ri.id in :ids
              and ri.routineId in (select r.id from Routine r where r.userId = :userId)
            """)
    List<RoutineItem> findOwnedByIds(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);

}
