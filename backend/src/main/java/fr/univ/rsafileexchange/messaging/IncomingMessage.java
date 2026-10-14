package fr.univ.rsafileexchange.messaging;

import java.util.UUID;

public record IncomingMessage(UUID messageId, String senderEmail, MessageEnvelope envelope) {
}
