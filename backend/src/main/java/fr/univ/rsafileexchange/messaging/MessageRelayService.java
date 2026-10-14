package fr.univ.rsafileexchange.messaging;

import java.security.Principal;

import fr.univ.rsafileexchange.account.Account;
import fr.univ.rsafileexchange.account.AccountService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class MessageRelayService {

    private final AccountService accountService;
    private final LiveRecipientRegistry liveRecipientRegistry;
    private final MessageEnvelopeValidator envelopeValidator;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageRelayService(
            AccountService accountService,
            LiveRecipientRegistry liveRecipientRegistry,
            MessageEnvelopeValidator envelopeValidator,
            SimpMessagingTemplate messagingTemplate) {
        this.accountService = accountService;
        this.liveRecipientRegistry = liveRecipientRegistry;
        this.envelopeValidator = envelopeValidator;
        this.messagingTemplate = messagingTemplate;
    }

    public void relay(Principal senderPrincipal, SendMessageRequest request) {
        if (senderPrincipal == null || !envelopeValidator.isValid(request)) {
            if (senderPrincipal != null && request != null && request.messageId() != null) {
                sendReceipt(senderPrincipal.getName(), request.messageId(), false, "INVALID_MESSAGE");
            }
            return;
        }

        Account recipient = accountService.findById(request.recipientId())
                .filter(Account::isVerified)
                .filter(account -> account.publicKeyPem() != null)
                .orElse(null);
        if (recipient == null || !liveRecipientRegistry.hasMessageSubscription(recipient.emailNormalized())) {
            sendReceipt(senderPrincipal.getName(), request.messageId(), false, "RECIPIENT_NOT_AVAILABLE");
            return;
        }

        messagingTemplate.convertAndSendToUser(
                recipient.emailNormalized(),
                "/queue/messages",
                new IncomingMessage(request.messageId(), senderPrincipal.getName(), request.envelope()));
        sendReceipt(senderPrincipal.getName(), request.messageId(), true, "RELAYED");
    }

    private void sendReceipt(String email, java.util.UUID messageId, boolean delivered, String code) {
        messagingTemplate.convertAndSendToUser(
                email,
                "/queue/receipts",
                new DeliveryReceipt(messageId, delivered, code));
    }
}
