package fr.univ.rsafileexchange.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.messaging.access.intercept.MessageMatcherDelegatingAuthorizationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class WebSocketSecurityConfigTest {

    private final AuthorizationManager<Message<?>> authorizationManager =
            new WebSocketSecurityConfig().messageAuthorizationManager(
                    MessageMatcherDelegatingAuthorizationManager.builder());

    private final Authentication authenticatedUser = UsernamePasswordAuthenticationToken.authenticated(
            "student@example.com",
            null,
            List.of(new SimpleGrantedAuthority("ROLE_USER")));

    @Test
    void permitsOnlyAuthenticatedMessageOperationsForThePrivateChat() {
        assertTrue(isAuthorized(SimpMessageType.CONNECT, null));
        assertTrue(isAuthorized(SimpMessageType.MESSAGE, "/app/messages"));
        assertTrue(isAuthorized(SimpMessageType.SUBSCRIBE, "/user/queue/messages"));
        assertTrue(isAuthorized(SimpMessageType.SUBSCRIBE, "/user/queue/receipts"));
    }

    @Test
    void deniesClientAccessToBrokerAndUnmatchedDestinations() {
        assertFalse(isAuthorized(SimpMessageType.MESSAGE, "/topic/messages"));
        assertFalse(isAuthorized(SimpMessageType.MESSAGE, "/queue/messages"));
        assertFalse(isAuthorized(SimpMessageType.SUBSCRIBE, "/queue/messages"));
        assertFalse(isAuthorized(SimpMessageType.SUBSCRIBE, "/user/queue/other"));
        assertFalse(isAuthorized(SimpMessageType.MESSAGE, "/app/other"));
    }

    private boolean isAuthorized(SimpMessageType messageType, String destination) {
        MessageBuilder<byte[]> builder = MessageBuilder.withPayload(new byte[0])
                .setHeader(SimpMessageHeaderAccessor.MESSAGE_TYPE_HEADER, messageType);
        if (destination != null) {
            builder.setHeader(SimpMessageHeaderAccessor.DESTINATION_HEADER, destination);
        }
        var decision = authorizationManager.authorize(() -> authenticatedUser, builder.build());
        return decision != null && decision.isGranted();
    }
}
