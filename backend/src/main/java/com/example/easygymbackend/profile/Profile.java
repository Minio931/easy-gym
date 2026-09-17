package com.example.easygymbackend.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * id = users.id (relacja 1:1 przez współdzielony PK). Rekord nie powstaje
 * przy zakładaniu konta (AdminUserService go nie tworzy) -- ProfileService
 * dociąga go leniwie przy pierwszym GET /api/profile.
 */
@Entity
@Table(name = "profiles")
@Getter
@Setter
@NoArgsConstructor
public class Profile {

    @Id
    private UUID id;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(nullable = false)
    private String unit;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

}
