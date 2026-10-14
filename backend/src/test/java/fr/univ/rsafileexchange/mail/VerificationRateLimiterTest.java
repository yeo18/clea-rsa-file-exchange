package fr.univ.rsafileexchange.mail;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;

class VerificationRateLimiterTest {

    @Test
    void allowsOnePerMinuteAndAtMostFivePerHour() {
        MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
        VerificationRateLimiter limiter = new VerificationRateLimiter(clock);

        assertTrue(limiter.allow("student@example.com"));
        assertFalse(limiter.allow("student@example.com"));
        for (int index = 1; index < 5; index++) {
            clock.advance(Duration.ofMinutes(1));
            assertTrue(limiter.allow("student@example.com"));
        }
        clock.advance(Duration.ofMinutes(1));
        assertFalse(limiter.allow("student@example.com"));

        clock.advance(Duration.ofHours(1));
        assertTrue(limiter.allow("student@example.com"));
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        private MutableClock(Instant now) {
            this.now = now;
        }

        private void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
