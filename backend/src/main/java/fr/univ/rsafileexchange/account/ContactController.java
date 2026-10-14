package fr.univ.rsafileexchange.account;

import java.util.Optional;
import java.util.UUID;

import fr.univ.rsafileexchange.messaging.LiveRecipientRegistry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class ContactController {

    private final AccountService accountService;
    private final PublicKeyValidator publicKeyValidator;
    private final LiveRecipientRegistry liveRecipientRegistry;

    public ContactController(
            AccountService accountService,
            PublicKeyValidator publicKeyValidator,
            LiveRecipientRegistry liveRecipientRegistry) {
        this.accountService = accountService;
        this.publicKeyValidator = publicKeyValidator;
        this.liveRecipientRegistry = liveRecipientRegistry;
    }

    @PutMapping("/account/public-key")
    public ResponseEntity<Void> savePublicKey(
            @Valid @RequestBody PublicKeyRequest request,
            Authentication authentication) {
        publicKeyValidator.validate(request.publicKeyPem());
        Account account = accountService.findByEmail(authentication.getName())
                .filter(Account::isVerified)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        accountService.savePublicKey(account.id(), request.publicKeyPem());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/contacts")
    public RecipientResponse findRecipient(@RequestParam @Email @Size(max = 320) String email) {
        Optional<Account> recipient = accountService.findByEmail(email)
                .filter(Account::isVerified)
                .filter(account -> account.publicKeyPem() != null);
        Account account = recipient.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return new RecipientResponse(
                account.id(),
                account.emailNormalized(),
                account.publicKeyPem(),
                liveRecipientRegistry.hasMessageSubscription(account.emailNormalized()));
    }

    @ExceptionHandler(InvalidPublicKeyException.class)
    public ResponseEntity<ErrorResponse> invalidPublicKey() {
        return ResponseEntity.badRequest().body(new ErrorResponse("La clé publique RSA est invalide."));
    }

    public record PublicKeyRequest(
            @NotBlank @Size(max = 4096) String publicKeyPem) {
    }

    public record RecipientResponse(UUID id, String email, String publicKeyPem, boolean online) {
    }

    public record ErrorResponse(String message) {
    }
}
