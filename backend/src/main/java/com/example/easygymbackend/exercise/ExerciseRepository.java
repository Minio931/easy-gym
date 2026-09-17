package com.example.easygymbackend.exercise;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExerciseRepository extends JpaRepository<Exercise, UUID> {

    /** Widoczne dla usera = jego własne + globalne z seeda (user_id IS NULL). */
    @Query("""
            select e from Exercise e
            where e.deletedAt is null
              and (e.userId is null or e.userId = :userId)
            order by e.name
            """)
    List<Exercise> findVisible(@Param("userId") UUID userId);

    /**
     * Fuzzy search po stronie Postgresa (pg_trgm, indeks GIN z V3) -- podobieństwo
     * łapie literówki ("wyciskanei"), ILIKE łapie fragmenty krótsze niż próg
     * trigramowy ("wyc"). Sortowanie promuje dopasowania od początku nazwy.
     */
    @Query(value = """
            SELECT * FROM exercises e
            WHERE e.deleted_at IS NULL
              AND (e.user_id IS NULL OR e.user_id = :userId)
              AND (e.name ILIKE '%' || :query || '%' OR similarity(e.name, :query) > 0.2)
            ORDER BY (e.name ILIKE :query || '%') DESC,
                     similarity(e.name, :query) DESC,
                     e.name
            """, nativeQuery = true)
    List<Exercise> searchVisible(@Param("userId") UUID userId, @Param("query") String query);

    Optional<Exercise> findByIdAndDeletedAtIsNull(UUID id);

    @Query("""
            select e.id from Exercise e
            where e.id in :ids
              and e.deletedAt is null
              and (e.userId is null or e.userId = :userId)
            """)
    List<UUID> findVisibleIds(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);

    /** Pull dla sync: własne zmiany + zmiany w katalogu globalnym. */
    @Query("""
            select e from Exercise e
            where (e.userId = :userId or e.userId is null)
              and e.updatedAt > :since
            """)
    List<Exercise> findChangedSince(@Param("userId") UUID userId, @Param("since") Instant since);

    @Query("""
            select e from Exercise e
            where e.id in :ids
              and (e.userId = :userId or e.userId is null)
            """)
    List<Exercise> findOwnedOrGlobalByIds(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);

}
