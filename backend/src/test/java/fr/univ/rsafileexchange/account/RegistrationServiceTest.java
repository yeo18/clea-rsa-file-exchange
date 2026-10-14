package fr.univ.rsafileexchange.account;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.sql.Timestamp;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class RegistrationServiceTest {

    @Autowired
    private AccountService accountService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private JavaMailSender mailSender;

    @BeforeEach
    void resetMail() {
        org.mockito.Mockito.reset(mailSender);
    }

    @Test
    void normalizesEmailHashesPasswordAndDoesNotDuplicateAccounts() {
        String email = "  Student." + java.util.UUID.randomUUID() + "@Example.com ";
        String normalized = email.trim().toLowerCase(java.util.Locale.ROOT);
        accountService.register(email, "a sufficiently long password");

        var row = jdbcTemplate.queryForMap(
                "SELECT email_normalized, password_hash, verification_token_hash, verification_expires_at, verified_at "
                        + "FROM accounts WHERE email_normalized = ?",
                normalized);

        assertNotEquals("a sufficiently long password", row.get("password_hash"));
        assertTrue(((byte[]) row.get("verification_token_hash")).length == 32);
        assertTrue(((Timestamp) row.get("verification_expires_at"))
                .toInstant().isAfter(java.time.Instant.now()));
        assertNull(row.get("verified_at"));

        accountService.register(normalized, "a sufficiently long password");
        verify(mailSender, times(1)).send(any(SimpleMailMessage.class));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM accounts WHERE email_normalized = ?",
                Integer.class,
                normalized));
    }

    @Test
    void leavesPendingAccountAvailableForResendWhenSmtpFails() {
        doThrow(new MailSendException("SMTP unavailable"))
                .when(mailSender).send(any(SimpleMailMessage.class));
        String email = "mail.failure-" + java.util.UUID.randomUUID() + "@example.com";

        org.junit.jupiter.api.Assertions.assertThrows(
                MailSendException.class,
                () -> accountService.register(email, "a sufficiently long password"));

        var row = jdbcTemplate.queryForMap(
                "SELECT verified_at, verification_token_hash FROM accounts WHERE email_normalized = ?",
                email);
        assertNull(row.get("verified_at"));
        assertTrue(((byte[]) row.get("verification_token_hash")).length == 32);
    }

    @Test
    void resendsVerificationOnlyWithinConfiguredAddressLimits() {
        String email = "resend-" + java.util.UUID.randomUUID() + "@example.com";
        accountService.register(email, "a sufficiently long password");
        org.mockito.Mockito.reset(mailSender);

        accountService.resendVerification(email);
        accountService.resendVerification(" " + email.toUpperCase(java.util.Locale.ROOT) + " ");

        verify(mailSender, times(0)).send(any(SimpleMailMessage.class));
    }
}
