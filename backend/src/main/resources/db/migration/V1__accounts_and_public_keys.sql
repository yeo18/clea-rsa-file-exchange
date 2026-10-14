CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    email_normalized VARCHAR(320) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    verified_at TIMESTAMPTZ,
    verification_token_hash BYTEA UNIQUE,
    verification_expires_at TIMESTAMPTZ,
    public_key_pem TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT accounts_verification_fields_together CHECK (
        (verification_token_hash IS NULL) = (verification_expires_at IS NULL)
    ),
    CONSTRAINT accounts_token_hash_length CHECK (
        verification_token_hash IS NULL OR octet_length(verification_token_hash) = 32
    ),
    CONSTRAINT accounts_public_key_size CHECK (
        public_key_pem IS NULL OR length(public_key_pem) <= 4096
    )
);

CREATE INDEX accounts_unverified_email_idx
    ON accounts (email_normalized)
    WHERE verified_at IS NULL;
