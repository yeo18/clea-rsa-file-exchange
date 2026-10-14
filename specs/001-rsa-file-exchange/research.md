# Research: Accounts and Live Encrypted Messaging

Date: 2026-10-12

## Decisions

### Browser-side hybrid encryption for messages

- **Decision**: Encrypt each message in the browser with a fresh AES-256-GCM key and 96-bit random IV; wrap the raw AES key with the recipient's registered RSA-OAEP/SHA-256 public key. Send only a bounded versioned JSON envelope over STOMP. The recipient decrypts with its locally imported private key.
- **Rationale**: RSA-OAEP is suitable for wrapping a small key, not arbitrary message text. AES-GCM encrypts and authenticates the message. This reuses the file-exchange trust boundary and lets the server remain a ciphertext-only relay.
- **Alternatives considered**: Encrypt the message directly with RSA (size-limited and inappropriate for general text); server-side encryption (would expose plaintext to the server).
- **Limitations**: Encryption does not authenticate the sender or hide routing/traffic metadata. The server can withhold or delay messages.

### Session-authenticated STOMP/WebSocket with an in-memory broker

- **Decision**: Use Spring's Servlet/MVC WebSocket STOMP support and simple broker. Authenticate the HTTP upgrade using the Spring Security session, route through an application destination, and deliver to a per-user queue based on the recipient account's normalized email principal.
- **Rationale**: Spring associates the authenticated HTTP principal with the WebSocket session. Its simple broker is adequate for one instance and online-only delivery; it stores subscriptions, not a durable mailbox.
- **Alternatives considered**: A message database, external broker, or offline queue conflicts with the clarified no-storage behavior and increases operational complexity. A custom raw WebSocket protocol would require more application-level framing and authorization.
- **Security rules**: Authorize inbound STOMP SEND and SUBSCRIBE destinations; deny client sends to broker destinations; authorize the recipient server-side; derive sender identity from `Principal`; restrict allowed origins; bound message size; require CSRF protection on cookie-authenticated requests and STOMP CONNECT. `SimpUserRegistry`/user destinations do not provide durable or exactly-once delivery.
- **Official references**: [Spring Boot WebSockets](https://docs.spring.io/spring-boot/reference/messaging/websockets.html), [STOMP authentication](https://docs.spring.io/spring-framework/reference/7.0/web/websocket/stomp/authentication.html), [enable STOMP](https://docs.spring.io/spring-framework/reference/7.0/web/websocket/stomp/enable.html), [simple broker](https://docs.spring.io/spring-framework/reference/7.0/web/websocket/stomp/handle-simple-broker.html), [user destinations](https://docs.spring.io/spring-framework/reference/7.0/web/websocket/stomp/user-destination.html), [Spring Security WebSocket](https://docs.spring.io/spring-security/reference/servlet/integrations/websocket.html).

### Verified accounts and browser sessions

- **Decision**: Normalize email addresses by trimming and lowercasing the complete address with `Locale.ROOT`; do not apply provider-specific dot/plus aliases. Persist a pending account and a cryptographically random verification-token digest with a 24-hour expiry. Email the raw token; consume its digest once using an atomic database update and establish the session on successful verification. Use Spring Security's adaptive `PasswordEncoder` and standard session authentication with session-fixation protection.
- **Rationale**: Avoid custom password cryptography or bearer-token storage. Database-backed token digest and atomic consumption ensure the raw verification link is not retained and cannot be reused.
- **Defaults**: Registration and resend responses do not disclose whether an address exists or is already verified. Verification mail is limited to one send per normalized address per minute and five per hour; a throttled request returns the same generic response. Sending mail occurs after the pending account/token transaction commits; on SMTP failure leave the account pending and permit a rate-limited resend. No outbox is justified for this single-instance educational project.
- **Official references**: [Spring Security password storage](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html), [HTTP authorization](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html), [session management](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html), [CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html).

### CSRF, cookies, and WebSocket authorization

- **Decision**: Keep same-origin session cookies; enable CSRF for state-changing HTTP requests and STOMP CONNECT; configure secure, HttpOnly session cookies in production and restrict WebSocket origins.
- **Rationale**: Cookies are automatically sent by browsers, so authenticated HTTP and WebSocket handshakes require CSRF/origin defenses. Do not disable CSRF globally to simplify the SPA.
- **Official references**: [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html), [WebSocket authorization](https://docs.spring.io/spring-framework/reference/7.0/web/websocket/stomp/authorization.html), [STOMP interception](https://docs.spring.io/spring-framework/reference/7.0/web/websocket/stomp/interceptors.html).

### PostgreSQL, migrations, and local SMTP

- **Decision**: Use Spring JDBC with PostgreSQL and Flyway migrations for the small account-only model. Run PostgreSQL and Mailpit through Docker Compose, binding development ports to loopback. Configure real SMTP through environment variables outside source control.
- **Rationale**: JDBC avoids an unnecessary ORM; migrations give a repeatable schema. Mailpit provides a local SMTP capture UI without sending test links externally. Local credentials are disposable development defaults, never production configuration.
- **Email behavior**: Use Spring Boot's `JavaMailSender` support and configure finite SMTP connect/read/write timeouts. A failed email send leaves the account unverified.
- **Official references**: [Spring Boot SQL data access](https://docs.spring.io/spring-boot/reference/data/sql.html), [Spring Boot sending email](https://docs.spring.io/spring-boot/reference/io/email.html), [Spring JDBC](https://docs.spring.io/spring-framework/reference/data-access/jdbc.html).

### Test strategy

- **Decision**: Test account/service rules with mocked mail delivery; HTTP rules with MockMvc; database uniqueness/atomic verification against PostgreSQL; and STOMP routing with two authenticated clients. Assert ciphertext is unchanged, never logged or persisted, and is not delivered after the recipient goes offline.
- **Rationale**: Unit tests prove lifecycle edges; live PostgreSQL and WebSocket tests validate the boundaries that mocks cannot.
- **Official references**: [Spring Boot testing](https://docs.spring.io/spring-boot/reference/testing/index.html), [STOMP client](https://docs.spring.io/spring-framework/reference/7.0/web/websocket/stomp/client.html).

## Explicit scope boundaries

- The backend may persist account credentials, verification token digests, and public keys only.
- Message ciphertext is transient input/output; it has no database entity or message repository.
- The simple broker is single-instance and best-effort. No offline delivery, retries, durable acknowledgement, attachment transmission, or message history.
- The demo trace is disabled by default, development-only, and never prints plaintext, identifiers, tokens, or private key material.
