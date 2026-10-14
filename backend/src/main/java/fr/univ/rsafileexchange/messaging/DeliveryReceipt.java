package fr.univ.rsafileexchange.messaging;

import java.util.UUID;

public record DeliveryReceipt(UUID messageId, boolean delivered, String code) {
}
