package fr.univ.rsafileexchange.messaging;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class MessageEnvelopeValidatorTest {

    private final MessageEnvelopeValidator validator = new MessageEnvelopeValidator();

    @Test
    void acceptsABoundedVersionOneEnvelope() {
        assertTrue(validator.isValid(request(validEnvelope())));
    }

    @Test
    void rejectsUnsupportedVersionAndAlgorithms() {
        MessageEnvelope valid = validEnvelope();
        MessageEnvelope unsupportedVersion = new MessageEnvelope(
                2, valid.keyEncryption(), valid.contentEncryption(), valid.ciphertext());
        MessageEnvelope unsupportedAlgorithm = new MessageEnvelope(
                1,
                new MessageEnvelope.KeyEncryption("RSA", "SHA-256", valid.keyEncryption().wrappedKey()),
                valid.contentEncryption(),
                valid.ciphertext());

        assertFalse(validator.isValid(request(unsupportedVersion)));
        assertFalse(validator.isValid(request(unsupportedAlgorithm)));
    }

    @Test
    void rejectsInvalidKeyAndIvSizesAndOversizedCiphertext() {
        MessageEnvelope valid = validEnvelope();
        MessageEnvelope shortWrappedKey = new MessageEnvelope(
                1,
                new MessageEnvelope.KeyEncryption(
                        "RSA-OAEP", "SHA-256", Base64.getEncoder().encodeToString(new byte[32])),
                valid.contentEncryption(),
                valid.ciphertext());
        MessageEnvelope shortIv = new MessageEnvelope(
                1,
                valid.keyEncryption(),
                new MessageEnvelope.ContentEncryption("AES-GCM", 256, Base64.getEncoder().encodeToString(new byte[8]), 128),
                valid.ciphertext());
        MessageEnvelope oversizedCiphertext = new MessageEnvelope(
                1,
                valid.keyEncryption(),
                valid.contentEncryption(),
                Base64.getEncoder().encodeToString(new byte[8 * 1024 + 17]));

        assertFalse(validator.isValid(request(shortWrappedKey)));
        assertFalse(validator.isValid(request(shortIv)));
        assertFalse(validator.isValid(request(oversizedCiphertext)));
    }

    private static SendMessageRequest request(MessageEnvelope envelope) {
        return new SendMessageRequest(UUID.randomUUID(), UUID.randomUUID(), envelope);
    }

    private static MessageEnvelope validEnvelope() {
        return new MessageEnvelope(
                1,
                new MessageEnvelope.KeyEncryption(
                        "RSA-OAEP", "SHA-256", Base64.getEncoder().encodeToString(new byte[384])),
                new MessageEnvelope.ContentEncryption(
                        "AES-GCM", 256, Base64.getEncoder().encodeToString(new byte[12]), 128),
                Base64.getEncoder().encodeToString(new byte[16]));
    }
}
