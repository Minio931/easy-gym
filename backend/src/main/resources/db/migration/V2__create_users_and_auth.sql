-- Accounts are created manually (admin endpoint / seed), no self-registration.
-- Passwords as a bcrypt hash (BCryptPasswordEncoder, Spring Security).
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_login UNIQUE (login)
);

CREATE TABLE profiles (
    id           UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    unit         TEXT NOT NULL DEFAULT 'kg',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_profiles_unit CHECK (unit = 'kg')
);

-- Refresh tokens: absent from the section 2 data model, but JWT with
-- access+refresh (section 1 item 1) needs refresh-token state stored somewhere
-- so they can be revoked (logout, password change). We store the token hash,
-- not the raw value -- analogous to password_hash.
CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);
