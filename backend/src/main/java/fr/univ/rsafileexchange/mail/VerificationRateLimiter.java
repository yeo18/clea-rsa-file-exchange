package fr.univ.rsafileexchange.mail;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

import org.springframework.stereotype.Component;

@Component
public class VerificationRateLimiter {

    private static final Duration MINIMUM_INTERVAL = Duration.ofMinutes(1);
    private static final Duration WINDOW = Duration.ofHours(1);
    private static final int MAX_PER_WINDOW = 5;
    private static final int MAX_TRACKED_ADDRESSES = 10_000;

    private final Clock clock;
    private final Map<String, ArrayDeque<Instant>> attempts = new HashMap<>();

    public VerificationRateLimiter() {
        this(Clock.systemUTC());
    }

    VerificationRateLimiter(Clock clock) {
        this.clock = clock;
    }

    public synchronized boolean allow(String normalizedEmail) {
        Instant now = clock.instant();
        Instant cutoff = now.minus(WINDOW);
        ArrayDeque<Instant> sends = attempts.computeIfAbsent(normalizedEmail, ignored -> new ArrayDeque<>());

        while (!sends.isEmpty() && !sends.peekFirst().isAfter(cutoff)) {
            sends.removeFirst();
        }

        if (!sends.isEmpty() && sends.peekLast().plus(MINIMUM_INTERVAL).isAfter(now)) {
            return false;
        }
        if (sends.size() >= MAX_PER_WINDOW) {
            return false;
        }

        sends.addLast(now);
        evictOldestAddressIfNeeded(normalizedEmail);
        return true;
    }

    private void evictOldestAddressIfNeeded(String currentEmail) {
        if (attempts.size() <= MAX_TRACKED_ADDRESSES) {
            return;
        }

        Iterator<String> keys = attempts.keySet().iterator();
        while (keys.hasNext()) {
            String oldest = keys.next();
            if (!oldest.equals(currentEmail)) {
                keys.remove();
                return;
            }
        }
    }
}
