package fr.univ.rsafileexchange.mail;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import fr.univ.rsafileexchange.account.Account;
import fr.univ.rsafileexchange.account.AccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Service
public class EmailVerificationService {

    private static final Duration TOKEN_LIFETIME = Duration.ofHours(24);
    private static final Pattern TOKEN_PATTERN = Pattern.compile("[A-Za-z0-9_-]{43}");

    private final AccountRepository accountRepository;
    private final JavaMailSender mailSender;
    private final VerificationRateLimiter rateLimiter;
    private final Clock clock;
    private final SecureRandom secureRandom = new SecureRandom();
    private final String appBaseUrl;
    private final String mailFrom;
    private final String resendApiKey;
    private final RestClient resendClient;

    public EmailVerificationService(
            AccountRepository accountRepository,
            JavaMailSender mailSender,
            VerificationRateLimiter rateLimiter,
            Clock clock,
            @Value("${clea.app.base-url}") String appBaseUrl,
            @Value("${clea.app.mail-from:no-reply@clea.local}") String mailFrom,
            @Value("${clea.mail.resend-api-key:}") String resendApiKey) {
        this.accountRepository = accountRepository;
        this.mailSender = mailSender;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
        this.appBaseUrl = appBaseUrl.replaceAll("/+$", "");
        this.mailFrom = mailFrom;
        this.resendApiKey = resendApiKey;
        this.resendClient = RestClient.create("https://api.resend.com");
    }

    public void issueForNewAccount(Account account) {
        if (!rateLimiter.allow(account.emailNormalized())) {
            return;
        }
        issue(account);
    }

    public void requestResend(String normalizedEmail) {
        Optional<Account> account = accountRepository.findByEmail(normalizedEmail);
        if (account.isEmpty() || account.get().isVerified()) {
            return;
        }
        if (!rateLimiter.allow(normalizedEmail)) {
            return;
        }
        issue(account.get());
    }

    public Account verify(String token) {
        if (token == null || !TOKEN_PATTERN.matcher(token).matches()) {
            throw new InvalidVerificationTokenException();
        }
        byte[] tokenBytes;
        try {
            tokenBytes = Base64.getUrlDecoder().decode(token);
        } catch (IllegalArgumentException exception) {
            throw new InvalidVerificationTokenException();
        }
        if (tokenBytes.length != 32) {
            throw new InvalidVerificationTokenException();
        }

        return accountRepository.consumeVerificationToken(digest(tokenBytes))
                .orElseThrow(InvalidVerificationTokenException::new);
    }

    private void issue(Account account) {
        byte[] tokenBytes = new byte[32];
        secureRandom.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        accountRepository.updateVerificationToken(
                account.id(),
                digest(tokenBytes),
                clock.instant().plus(TOKEN_LIFETIME));

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailFrom);
        message.setTo(account.emailNormalized());
        message.setSubject("Vérifiez votre adresse e-mail - Cléa");
        message.setText("Pour vérifier votre adresse e-mail, ouvrez ce lien dans Cléa :\n\n"
                + appBaseUrl + "/#verify=" + token + "\n\n"
                + "Ce lien est valable pendant 24 heures et ne peut être utilisé qu'une fois.");
        if (resendApiKey.isBlank()) {
            mailSender.send(message);
            return;
        }

        try {
            resendClient.post()
                    .uri("/emails")
                    .header("Authorization", "Bearer " + resendApiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "from", mailFrom,
                            "to", List.of(account.emailNormalized()),
                            "subject", message.getSubject(),
                            "text", message.getText()))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            throw new MailSendException("The email verification provider rejected the request.", exception);
        }
    }

    private static byte[] digest(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }
}
