package fr.univ.rsafileexchange.messaging;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.user.SimpSession;
import org.springframework.messaging.simp.user.SimpSubscription;
import org.springframework.messaging.simp.user.SimpUser;
import org.springframework.messaging.simp.user.SimpUserRegistry;

class LiveRecipientRegistryTest {

    private final SimpUserRegistry userRegistry = mock(SimpUserRegistry.class);
    private final LiveRecipientRegistry liveRecipientRegistry = new LiveRecipientRegistry(userRegistry);

    @Test
    void onlyConsidersTheAuthorizedPrivateMessageSubscriptionOnline() {
        SimpUser user = mock(SimpUser.class);
        SimpSession session = mock(SimpSession.class);
        SimpSubscription messageSubscription = mock(SimpSubscription.class);
        when(userRegistry.getUser("student@example.com")).thenReturn(user);
        when(user.getSessions()).thenReturn(Set.of(session));
        when(session.getSubscriptions()).thenReturn(Set.of(messageSubscription));
        when(messageSubscription.getDestination()).thenReturn("/user/queue/messages");

        assertTrue(liveRecipientRegistry.hasMessageSubscription("student@example.com"));

        when(messageSubscription.getDestination()).thenReturn("/user/queue/receipts");
        assertFalse(liveRecipientRegistry.hasMessageSubscription("student@example.com"));
        assertFalse(liveRecipientRegistry.hasMessageSubscription("missing@example.com"));
    }
}
