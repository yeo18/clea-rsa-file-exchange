package fr.univ.rsafileexchange.messaging;

import java.util.Base64;
import java.util.UUID;

import org.springframework.stereotype.Component;

@Component
public class MessageEnvelopeValidator {

    private static final int RSA_WRAPPED_KEY_BYTES = 384;
    private static final int AES_GCM_IV_BYTES = 12;
    private static final int AES_GCM_TAG_BYTES = 16;
    private static final int MAX_PLAINTEXT_BYTES = 8 * 1024;
    private static final int MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + AES_GCM_TAG_BYTES;
    private static final int MAX_FRAME_BYTES = 16 * 1024;

    public boolean isValid(SendMessageRequest request) {
        if (request == null || request.messageId() == null || request.recipientId() == null) {
            return false;
        }
        MessageEnvelope envelope = request.envelope();
        if (envelope == null
                || envelope.version() != 1
                || envelope.keyEncryption() == null
                || envelope.contentEncryption() == null
                || !"RSA-OAEP".equals(envelope.keyEncryption().name())
                || !"SHA-256".equals(envelope.keyEncryption().hash())
                || !"AES-GCM".equals(envelope.contentEncryption().name())
                || envelope.contentEncryption().length() != 256
                || envelope.contentEncryption().tagLength() != 128) {
            return false;
        }

        byte[] wrappedKey = decode(envelope.keyEncryption().wrappedKey(), RSA_WRAPPED_KEY_BYTES);
        byte[] iv = decode(envelope.contentEncryption().iv(), AES_GCM_IV_BYTES);
        byte[] ciphertext = decode(envelope.ciphertext(), MAX_CIPHERTEXT_BYTES);
        if (wrappedKey == null || wrappedKey.length != RSA_WRAPPED_KEY_BYTES
                || iv == null || iv.length != AES_GCM_IV_BYTES
                || ciphertext == null || ciphertext.length < AES_GCM_TAG_BYTES) {
            return false;
        }
        return request.envelope().toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                <= MAX_FRAME_BYTES;
    }

    private static byte[] decode(String encoded, int maxBytes) {
        if (encoded == null || encoded.isEmpty() || encoded.length() > ((maxBytes + 2) / 3) * 4
                || encoded.length() % 4 != 0 || !encoded.matches("[A-Za-z0-9+/]*={0,2}")) {
            return null;
        }
        try {
            return Base64.getDecoder().decode(encoded);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
