package fr.univ.rsafileexchange.account;

import java.time.Instant;
import java.util.UUID;

public record Account(
        UUID id,
        String emailNormalized,
        String passwordHash,
        Instant verifiedAt,
        byte[] verificationTokenHash,
        Instant verificationExpiresAt,
        String publicKeyPem,
        Instant createdAt) {

    public boolean isVerified() {
        return verifiedAt != null;
    }
}
