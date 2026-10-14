package fr.univ.rsafileexchange.account;

import java.util.List;
import java.util.Optional;

import fr.univ.rsafileexchange.mail.EmailVerificationService;
import fr.univ.rsafileexchange.mail.InvalidVerificationTokenException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String GENERIC_REGISTRATION_MESSAGE =
            "Si l’adresse peut être vérifiée, un e-mail de vérification sera envoyé.";
    private static final String GENERIC_RESEND_MESSAGE =
            "Si l’adresse peut être vérifiée, un e-mail de vérification sera envoyé.";
    private static final String INVALID_CREDENTIALS_MESSAGE =
            "Identifiants invalides ou adresse e-mail non vérifiée.";

    private final AccountService accountService;
    private final EmailVerificationService emailVerificationService;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(
            AccountService accountService,
            EmailVerificationService emailVerificationService,
            SecurityContextRepository securityContextRepository) {
        this.accountService = accountService;
        this.emailVerificationService = emailVerificationService;
        this.securityContextRepository = securityContextRepository;
    }

    @PostMapping("/register")
    public ResponseEntity<MessageResponse> register(@Valid @RequestBody RegistrationRequest request) {
        accountService.register(request.email(), request.password());
        return ResponseEntity.accepted().body(new MessageResponse(GENERIC_REGISTRATION_MESSAGE));
    }

    @PostMapping("/verify")
    public ResponseEntity<?> verify(
            @Valid @RequestBody VerificationRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        Account account = emailVerificationService.verify(request.token());
        authenticateSession(account, servletRequest, servletResponse);
        return ResponseEntity.ok(AccountSession.from(account));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<MessageResponse> resendVerification(
            @Valid @RequestBody ResendVerificationRequest request) {
        emailVerificationService.requestResend(AccountService.normalizeEmail(request.email()));
        return ResponseEntity.accepted().body(new MessageResponse(GENERIC_RESEND_MESSAGE));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        Optional<Account> account = accountService.authenticate(request.email(), request.password());
        if (account.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new MessageResponse(INVALID_CREDENTIALS_MESSAGE));
        }
        authenticateSession(account.get(), servletRequest, servletResponse);
        return ResponseEntity.ok(AccountSession.from(account.get()));
    }

    @GetMapping("/session")
    public ResponseEntity<AccountSession> session(Authentication authentication) {
        return accountService.findByEmail(authentication.getName())
                .map(AccountSession::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        SecurityContextHolder.clearContext();
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(InvalidVerificationTokenException.class)
    public ResponseEntity<MessageResponse> invalidVerificationToken() {
        return ResponseEntity.badRequest().body(new MessageResponse("Lien invalide, expiré ou déjà utilisé."));
    }

    @ExceptionHandler(MailException.class)
    public ResponseEntity<MessageResponse> mailUnavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new MessageResponse("Le service e-mail est temporairement indisponible. Réessayez plus tard."));
    }

    private void authenticateSession(
            Account account,
            HttpServletRequest request,
            HttpServletResponse response) {
        request.getSession(true);
        request.changeSessionId();

        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
                account.emailNormalized(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }

    public record RegistrationRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(min = 12, max = 128) String password) {
    }

    public record LoginRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(max = 128) String password) {
    }

    public record VerificationRequest(@NotBlank @Size(min = 43, max = 43) String token) {
    }

    public record ResendVerificationRequest(
            @NotBlank @Email @Size(max = 320) String email) {
    }

    public record AccountSession(java.util.UUID id, String email, boolean hasPublicKey) {
        public static AccountSession from(Account account) {
            return new AccountSession(account.id(), account.emailNormalized(), account.publicKeyPem() != null);
        }
    }

    public record MessageResponse(String message) {
    }
}
