package fr.univ.rsafileexchange.account;

import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import fr.univ.rsafileexchange.mail.EmailVerificationService;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AccountService {

    private static final String DUMMY_PASSWORD = "not-a-real-user-password";

    private final AccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerificationService emailVerificationService;
    private final String dummyPasswordHash;

    public AccountService(
            AccountRepository accountRepository,
            PasswordEncoder passwordEncoder,
            EmailVerificationService emailVerificationService) {
        this.accountRepository = accountRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailVerificationService = emailVerificationService;
        this.dummyPasswordHash = passwordEncoder.encode(DUMMY_PASSWORD);
    }

    public void register(String email, String password) {
        String normalizedEmail = normalizeEmail(email);
        if (normalizedEmail.isEmpty() || normalizedEmail.length() > 320
                || password == null || password.length() < 12 || password.length() > 128) {
            throw new IllegalArgumentException("Invalid registration input");
        }
        if (accountRepository.findByEmail(normalizedEmail).isPresent()) {
            return;
        }

        Account account = new Account(
                UUID.randomUUID(),
                normalizedEmail,
                passwordEncoder.encode(password),
                null,
                null,
                null,
                null,
                Instant.now());
        try {
            accountRepository.insert(account);
        } catch (DuplicateKeyException exception) {
            return;
        }
        emailVerificationService.issueForNewAccount(account);
    }

    public void resendVerification(String email) {
        emailVerificationService.requestResend(normalizeEmail(email));
    }

    public Optional<Account> authenticate(String email, String password) {
        String normalizedEmail = normalizeEmail(email);
        Optional<Account> account = accountRepository.findByEmail(normalizedEmail);
        String passwordHash = account.map(Account::passwordHash).orElse(dummyPasswordHash);
        boolean passwordMatches = password != null && passwordEncoder.matches(password, passwordHash);
        if (account.isEmpty() || !account.get().isVerified() || !passwordMatches) {
            return Optional.empty();
        }
        return account;
    }

    public Optional<Account> findByEmail(String email) {
        return accountRepository.findByEmail(normalizeEmail(email));
    }

    public Optional<Account> findById(UUID id) {
        return accountRepository.findById(id);
    }

    public void savePublicKey(UUID accountId, String publicKeyPem) {
        accountRepository.updatePublicKey(accountId, publicKeyPem);
    }

    public static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }
}
