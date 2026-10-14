package fr.univ.rsafileexchange.account;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class AccountRepository {

    private static final RowMapper<Account> ACCOUNT_ROW_MAPPER = AccountRepository::mapAccount;
    private final JdbcTemplate jdbcTemplate;

    public AccountRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Account> findByEmail(String emailNormalized) {
        List<Account> accounts = jdbcTemplate.query(
                "SELECT id, email_normalized, password_hash, verified_at, verification_token_hash, "
                        + "verification_expires_at, public_key_pem, created_at "
                        + "FROM accounts WHERE email_normalized = ?",
                ACCOUNT_ROW_MAPPER,
                emailNormalized);
        return accounts.stream().findFirst();
    }

    public Optional<Account> findById(UUID id) {
        List<Account> accounts = jdbcTemplate.query(
                "SELECT id, email_normalized, password_hash, verified_at, verification_token_hash, "
                        + "verification_expires_at, public_key_pem, created_at "
                        + "FROM accounts WHERE id = ?",
                ACCOUNT_ROW_MAPPER,
                id);
        return accounts.stream().findFirst();
    }

    public void insert(Account account) {
        jdbcTemplate.update(
                "INSERT INTO accounts "
                        + "(id, email_normalized, password_hash, verified_at, verification_token_hash, "
                        + "verification_expires_at, public_key_pem, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                account.id(),
                account.emailNormalized(),
                account.passwordHash(),
                timestamp(account.verifiedAt()),
                account.verificationTokenHash(),
                timestamp(account.verificationExpiresAt()),
                account.publicKeyPem(),
                timestamp(account.createdAt()));
    }

    public void updateVerificationToken(UUID accountId, byte[] tokenHash, Instant expiresAt) {
        jdbcTemplate.update(
                "UPDATE accounts SET verification_token_hash = ?, verification_expires_at = ? "
                        + "WHERE id = ? AND verified_at IS NULL",
                tokenHash,
                Timestamp.from(expiresAt),
                accountId);
    }

    public Optional<Account> consumeVerificationToken(byte[] tokenHash) {
        List<Account> accounts = jdbcTemplate.query(
                "UPDATE accounts SET verified_at = CURRENT_TIMESTAMP, "
                        + "verification_token_hash = NULL, verification_expires_at = NULL "
                        + "WHERE verification_token_hash = ? "
                        + "AND verification_expires_at > CURRENT_TIMESTAMP AND verified_at IS NULL "
                        + "RETURNING id, email_normalized, password_hash, verified_at, "
                        + "verification_token_hash, verification_expires_at, public_key_pem, created_at",
                ACCOUNT_ROW_MAPPER,
                tokenHash);
        return accounts.stream().findFirst();
    }

    public void updatePublicKey(UUID accountId, String publicKeyPem) {
        jdbcTemplate.update(
                "UPDATE accounts SET public_key_pem = ? WHERE id = ? AND verified_at IS NOT NULL",
                publicKeyPem,
                accountId);
    }

    private static Account mapAccount(ResultSet resultSet, int rowNumber) throws SQLException {
        return new Account(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("email_normalized"),
                resultSet.getString("password_hash"),
                instant(resultSet.getTimestamp("verified_at")),
                resultSet.getBytes("verification_token_hash"),
                instant(resultSet.getTimestamp("verification_expires_at")),
                resultSet.getString("public_key_pem"),
                instant(resultSet.getTimestamp("created_at")));
    }

    private static Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}
