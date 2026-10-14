package fr.univ.rsafileexchange.messaging;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

@Controller
public class MessageController {

    private final MessageRelayService messageRelayService;

    public MessageController(MessageRelayService messageRelayService) {
        this.messageRelayService = messageRelayService;
    }

    @MessageMapping("/messages")
    public void relay(@Payload SendMessageRequest request, Principal senderPrincipal) {
        messageRelayService.relay(senderPrincipal, request);
    }
}
