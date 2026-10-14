package fr.univ.rsafileexchange.messaging;

import java.util.UUID;

public record SendMessageRequest(
        UUID messageId,
        UUID recipientId,
        MessageEnvelope envelope) {
}
