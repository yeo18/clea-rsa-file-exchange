package fr.univ.rsafileexchange.messaging;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import fr.univ.rsafileexchange.account.AccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class MessageRelayIntegrationTest {

    @Autowired
    private AccountService accountService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MessageRelayService messageRelayService;

    @MockitoBean
    private LiveRecipientRegistry liveRecipientRegistry;

    @MockitoBean
    private SimpMessagingTemplate messagingTemplate;

    @MockitoBean
    private JavaMailSender mailSender;

    @BeforeEach
    void resetMocks() {
        reset(liveRecipientRegistry, messagingTemplate, mailSender);
    }

    @Test
    void routesTheUnchangedCiphertextOnlyToTheAuthenticatedRecipientsQueue() {
        String senderEmail = "sender-" + UUID.randomUUID() + "@example.com";
        String recipientEmail = "recipient-" + UUID.randomUUID() + "@example.com";
        accountService.register(senderEmail, "a sufficiently long password");
        accountService.register(recipientEmail, "another long password");
        jdbcTemplate.update(
                "UPDATE accounts SET verified_at = ?, verification_token_hash = NULL, "
                        + "verification_expires_at = NULL WHERE email_normalized = ?",
                Timestamp.from(Instant.now()),
                recipientEmail);
        var recipient = accountService.findByEmail(recipientEmail).orElseThrow();
        accountService.savePublicKey(recipient.id(), "public key");
        when(liveRecipientRegistry.hasMessageSubscription(recipientEmail)).thenReturn(true);

        MessageEnvelope envelope = validEnvelope();
        UUID messageId = UUID.randomUUID();
        SendMessageRequest request = new SendMessageRequest(messageId, recipient.id(), envelope);
        Principal authenticatedSender = () -> senderEmail;

        messageRelayService.relay(authenticatedSender, request);

        verify(messagingTemplate).convertAndSendToUser(
                eq(recipientEmail),
                eq("/queue/messages"),
                eq(new IncomingMessage(messageId, senderEmail, envelope)));
        verify(messagingTemplate).convertAndSendToUser(
                eq(senderEmail),
                eq("/queue/receipts"),
                eq(new DeliveryReceipt(messageId, true, "RELAYED")));
        org.junit.jupiter.api.Assertions.assertEquals(
                2,
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM accounts WHERE email_normalized IN (?, ?)",
                        Integer.class,
                        senderEmail,
                        recipientEmail));
    }

    @Test
    void doesNotQueueOrPersistMessagesForAnOfflineOrMalformedRecipient() {
        String senderEmail = "sender-offline-" + UUID.randomUUID() + "@example.com";
        String recipientEmail = "recipient-offline-" + UUID.randomUUID() + "@example.com";
        accountService.register(senderEmail, "a sufficiently long password");
        accountService.register(recipientEmail, "another long password");
        jdbcTemplate.update(
                "UPDATE accounts SET verified_at = CURRENT_TIMESTAMP, public_key_pem = 'public key', "
                        + "verification_token_hash = NULL, verification_expires_at = NULL "
                        + "WHERE email_normalized = ?",
                recipientEmail);
        var recipient = accountService.findByEmail(recipientEmail).orElseThrow();
        UUID messageId = UUID.randomUUID();
        SendMessageRequest request = new SendMessageRequest(messageId, recipient.id(), validEnvelope());
        Principal authenticatedSender = () -> senderEmail;
        when(liveRecipientRegistry.hasMessageSubscription(recipientEmail)).thenReturn(false);

        messageRelayService.relay(authenticatedSender, request);
        verify(messagingTemplate, never()).convertAndSendToUser(
                eq(recipientEmail), eq("/queue/messages"), any());
        verify(messagingTemplate).convertAndSendToUser(
                eq(senderEmail),
                eq("/queue/receipts"),
                eq(new DeliveryReceipt(messageId, false, "RECIPIENT_NOT_AVAILABLE")));

        MessageEnvelope invalidEnvelope = new MessageEnvelope(
                2,
                validEnvelope().keyEncryption(),
                validEnvelope().contentEncryption(),
                validEnvelope().ciphertext());
        messageRelayService.relay(
                authenticatedSender,
                new SendMessageRequest(UUID.randomUUID(), recipient.id(), invalidEnvelope));
        verify(messagingTemplate, never()).convertAndSendToUser(
                eq(recipientEmail), eq("/queue/messages"), any());
    }

    private static MessageEnvelope validEnvelope() {
        return new MessageEnvelope(
                1,
                new MessageEnvelope.KeyEncryption(
                        "RSA-OAEP",
                        "SHA-256",
                        Base64.getEncoder().encodeToString(new byte[384])),
                new MessageEnvelope.ContentEncryption(
                        "AES-GCM",
                        256,
                        Base64.getEncoder().encodeToString(new byte[12]),
                        128),
                Base64.getEncoder().encodeToString(new byte[32]));
    }
}
