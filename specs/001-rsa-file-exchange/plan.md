# Implementation Plan: RSA File Exchange and Live Messaging

**Branch**: `001-rsa-file-exchange` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/001-rsa-file-exchange/spec.md`

## Summary

Keep file and message cryptography in the browser. Extend Cléa with verified-email accounts, PostgreSQL-backed public keys, and a session-authenticated Spring STOMP/WebSocket relay that forwards opaque ciphertext only to a currently connected recipient. PostgreSQL and Mailpit run locally with Docker Compose. The relay is deliberately in-memory and online-only: no mailbox, message table, offline queue, or broker is introduced.

## Technical Context

**Language/Version**: TypeScript strict mode; Java 21 source compatibility.  
**Primary Dependencies**: Existing React/Vite/Web Crypto frontend; Spring Boot 4.1.1 MVC, Security, JDBC, WebSocket, Mail; PostgreSQL JDBC driver and Flyway; `@stomp/stompjs` for browser STOMP.  
**Storage**: PostgreSQL stores normalized account email, adaptive password hash, verification state/token digest/expiry, and optional public SPKI key. It stores no files, private keys, key passwords, message text, or ciphertext.  
**Testing**: Existing Vitest/Testing Library and Maven/JUnit/Spring test support; MockMvc and STOMP integration tests; PostgreSQL-backed integration tests using the Docker Compose service.  
**Target Platform**: Current browsers with Web Crypto over localhost/HTTPS; Java 21+ backend; Docker Compose for local PostgreSQL and Mailpit.  
**Project Type**: Web application with `frontend/` and `backend/`.  
**Performance Goals**: Maintain the 50 MiB file limit. Bound message text and encrypted envelopes; deliver messages only to subscribed online users without a durable queue. Verification mail has finite SMTP timeouts.  
**Constraints**: Same-origin frontend/API/WebSocket in production; Vite proxies `/api` and `/ws` in development. Cookie sessions require CSRF protection for state-changing HTTP and STOMP CONNECT. Restrict WebSocket origins. Normalize email by trimming and lowercasing with `Locale.ROOT` (no provider-specific alias rules). Limit verification resends to one per normalized address per minute and five per hour without revealing account state. Never log passwords, verification links/tokens, plaintext, private keys, or message ciphertext.  
**Scale/Scope**: Two-student educational application and a single backend instance; no horizontal broker, recovery, offline delivery, signatures, password recovery, or social features.

## Constitution Check

- **Confidentiality by Design**: Pass. All file and message encryption/decryption stays in Web Crypto. The server stores only account records, public keys, and hashed short-lived verification tokens, and transiently relays opaque ciphertext.
- **Standard Cryptography Only**: Pass. RSA-OAEP/SHA-256 wraps fresh AES-256-GCM keys; password hashes use Spring Security's adaptive password encoder; verification tokens use a cryptographically secure random source and are stored only as digests.
- **Testable Security and Correctness**: Pass. Plan tests registration and verification state, session/CSRF authorization, public-key ownership, recipient-only routing, ciphertext opacity, offline non-delivery, and existing file crypto/tamper behavior.
- **Simple, User-Understandable Product**: Pass. Accounts and live messaging are included only to satisfy the instructor's messaging requirement. No offline mailbox or unrelated product feature is added.
- **Small, Separated Applications**: Pass. Keep browser crypto and UI in `frontend/`; isolate Spring account, mail, and relay components in `backend/`; use one PostgreSQL container and one local SMTP capture service.

## Project Structure

```text
docker-compose.yml                 # Local PostgreSQL and Mailpit only
frontend/
└── src/
    ├── App.tsx                    # Existing single-page navigation plus account/chat views
    ├── components/
    ├── crypto/                    # Existing file formats plus message hybrid encryption
    ├── features/
    │   ├── auth/                  # Registration, verification, login, logout, session
    │   ├── chat/                  # Recipient lookup, WebSocket messaging and demo trace
    │   ├── keys/                  # Local private key and public-key registration
    │   ├── encrypt/
    │   └── decrypt/
    ├── services/                  # HTTP, CSRF and STOMP clients
    └── test/
backend/
├── pom.xml
└── src/
    ├── main/java/fr/univ/rsafileexchange/
    │   ├── account/               # Account model, JDBC repository, registration/login
    │   ├── config/                # HTTP, session, CSRF and STOMP security
    │   ├── health/
    │   ├── mail/                  # Verification email and token lifecycle
    │   └── messaging/             # Validated ciphertext relay; no message repository
    ├── main/resources/db/migration/
    └── test/java/fr/univ/rsafileexchange/
specs/001-rsa-file-exchange/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── websocket.md
└── tasks.md
README.md
```

**Structure Decision**: Retain the existing two-project web application and single-page frontend. Add only the feature boundaries needed for account lifecycle and live messaging. Use JDBC rather than an ORM for the small account schema; use Flyway migrations to keep the schema reproducible. The WebSocket relay has no persistence/repository layer.

## Design and implementation phases

### Phase 0 — Research

Decisions and official references are recorded in [research.md](research.md): Web Crypto hybrid message format; adaptive password storage, HTTP-session WebSocket authentication, authorization of STOMP destinations, no-durability broker semantics, SMTP timeouts, PostgreSQL/JDBC, and local Mailpit.

### Phase 1 — Design

- [Data model and cryptographic formats](data-model.md)
- [REST API contract](contracts/openapi.yaml)
- [STOMP relay contract](contracts/websocket.md)
- [Developer quickstart](quickstart.md)

### Phase 2 — Delivery

Tasks in [tasks.md](tasks.md) sequence account and database foundation before verified-email login, public keys, live relay, message UI, and integration validation. Preserve the already-tested file encryption behavior.

## Security and operational boundaries

- Registration, login, CSRF, session, public-key, and health HTTP APIs contain no file bytes or private-key material.
- Store only a one-way password hash and verification-token digest. Verification tokens expire in 24 hours and are consumed atomically once; successful verification creates the authenticated session.
- Trim and lowercase email addresses with `Locale.ROOT` for uniqueness and lookup. Do not apply provider-specific dot/plus alias normalization.
- Rate-limit verification mail to one message per normalized address per minute and five per hour; return the same generic response for unknown, already verified, and throttled resend requests.
- Authenticate the WebSocket handshake with the HTTP session. Authorize STOMP SEND/SUBSCRIBE destinations and derive the sender from the authenticated principal; never trust a claimed sender ID.
- Relay only a size-bounded, schema-validated encrypted envelope to the intended user's private queue. Never decrypt, store, log, or replay it.
- Use the built-in simple broker for the single-instance, live-only requirement. An offline recipient receives nothing; no retry queue is created.
- Enable HTTP CSRF and require the CSRF token on STOMP CONNECT. Restrict browser origins to the deployed origin and localhost Vite development origin.
- The development trace is opt-in and gated by Vite development mode; log algorithms and a short ciphertext sample only.
- Keep database and Mailpit development ports loopback-bound; map the PostgreSQL container's 5432 to host 15432 to avoid existing local-service conflicts on 5432 and 5433. Production requires HTTPS, externally configured SMTP, secure session cookies, and non-default database credentials.

## Complexity Tracking

| Added component | Why needed | Simpler alternative rejected because |
|----------------|------------|--------------------------------------|
| PostgreSQL account store | User explicitly approved verified accounts backed by PostgreSQL | In-memory users cannot survive restarts or support two users independently |
| SMTP + Mailpit | Mandatory email verification; safe local email testing | Skipping verification violates the clarified requirement |
| STOMP/WebSocket relay | Instructor requires direct live message delivery | Download-and-share does not let a recipient see the message in the app |
| Adaptive password encoder and session security | Required to protect accounts and authenticated relay access | Plaintext passwords or custom token sessions create avoidable security risk |
