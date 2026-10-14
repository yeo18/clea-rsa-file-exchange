package fr.univ.rsafileexchange.messaging;

import org.springframework.messaging.simp.user.SimpUser;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.stereotype.Component;

@Component
public class LiveRecipientRegistry {

    private static final String MESSAGE_QUEUE_DESTINATION = "/user/queue/messages";

    private final SimpUserRegistry simpUserRegistry;

    public LiveRecipientRegistry(SimpUserRegistry simpUserRegistry) {
        this.simpUserRegistry = simpUserRegistry;
    }

    public boolean hasMessageSubscription(String normalizedEmail) {
        SimpUser user = simpUserRegistry.getUser(normalizedEmail);
        if (user == null) {
            return false;
        }

        return user.getSessions().stream()
                .flatMap(session -> session.getSubscriptions().stream())
                .map(subscription -> subscription.getDestination())
                .anyMatch(MESSAGE_QUEUE_DESTINATION::equals);
    }
}
