# Tasks: RSA File Exchange

**Input**: Design documents in `specs/001-rsa-file-exchange/`  
**Prerequisites**: `plan.md`, `spec.md`; `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Format**: `[ID] [P?] [Story] Description`. `[P]` tasks touch separable files and can be parallelized.

## Phase 1: Project setup

- [x] T001 Create root README and `.gitignore` documenting frontend/backend starts, tests, generated files, and secret-safe exclusions.
- [x] T002 [P] Create the React/TypeScript strict Vite app in `frontend/` with scripts for dev, build, and tests.
- [x] T003 [P] Create the Java 21 Maven/Spring Boot application in `backend/` with Spring MVC and test dependencies.
- [x] T004 Verify both applications start independently and source/SDD ignore rules are correct in `frontend/`, `backend/`, and `.gitignore`.

## Phase 2: Foundational contracts

- [x] T005 Implement shared typed validation and safe error presentation in `frontend/src/crypto/`.
- [x] T006 [P] Implement bounded byte, base64, PEM/SPKI, filename and metadata helpers in `frontend/src/crypto/`.
- [x] T007 Define supported format versions/limits in `frontend/src/crypto/` and secure-context capability checks in `frontend/src/utils/secureContext.ts`.
- [x] T008 Add reusable accessible file selection/drop, progress, error, and download controls in `frontend/src/components/`.

## Phase 3: User Story 1 — Creating and exchanging keys (P1)

**Goal**: Generate RSA-OAEP keys locally and export a shareable public key and protected private key.  
**Independent test**: Generate, export, reload with valid passphrase; wrong passphrase and modified envelope fail.

- [x] T009 [P] [US1] Add Web Crypto RSA-OAEP/SHA-256 3072-bit key generation and typed key states in `frontend/src/features/keys/`.
- [x] T010 [P] [US1] Implement SPKI PEM public-key export/import and format validation in `frontend/src/features/keys/`.
- [x] T011 [US1] Implement PBKDF2-SHA-256/AES-256-GCM `.rsakey` export/import, passphrase confirmation/minimum, authenticated metadata, and bounded parser in `frontend/src/features/keys/`.
- [x] T012 [US1] Build key generation/import/export screen with warnings, progress, status, and accessible errors in `frontend/src/features/keys/`.
- [x] T013 [P] [US1] Test public-key SPKI round trip and rejected invalid PEM in `frontend/src/features/keys/`.
- [x] T014 [P] [US1] Test protected private-key round trip, wrong passphrase, tampering, and unsupported parameters in `frontend/src/features/keys/`.

## Phase 4: User Story 2 — Encrypting a file (P1)

**Goal**: Import recipient public key and create a bounded `.rsaenc` package without uploading any file/key data.  
**Independent test**: Encrypt valid files including empty input; validate the container and absence of plaintext/network upload.

- [x] T015 [P] [US2] Implement `.rsaenc` v1 header serialization/parsing and exact AAD byte construction in `frontend/src/crypto/`.
- [x] T016 [US2] Implement fresh AES-256-GCM key/96-bit IV generation and RSA-OAEP key wrapping in `frontend/src/features/encrypt/`.
- [x] T017 [US2] Enforce the 50 MiB limit before reading, preserve optional safe metadata, and download `.rsaenc` in `frontend/src/features/encrypt/`.
- [x] T018 [US2] Build the encrypt workflow, file summary, recipient-key state, progress, and accessible errors in `frontend/src/features/encrypt/`.
- [x] T019 [P] [US2] Test package layout, metadata AAD, empty/regular files, invalid public key, and size rejection in `frontend/src/crypto/` and `frontend/src/features/encrypt/`.

## Phase 5: User Story 3 — Decrypting a file (P1)

**Goal**: Authenticate/decrypt a `.rsaenc` package and restore the exact file with safe metadata.  
**Independent test**: Correct recipient key restores bytes; wrong key, malformed package, and any authenticated tamper produce no download.

- [x] T020 [US3] Implement strict bounded `.rsaenc` parsing and schema/version validation in `frontend/src/crypto/fileContainer.ts`.
- [x] T021 [US3] Implement RSA-OAEP AES-key unwrap and AES-GCM decryption with exact header AAD in `frontend/src/crypto/fileContainer.ts`.
- [x] T022 [US3] Enforce package limits, sanitize filename/MIME, and expose download only after authentication in `frontend/src/crypto/` and `frontend/src/features/decrypt/`.
- [x] T023 [US3] Build decrypt UI for package, protected key, passphrase, progress, and non-sensitive failure states in `frontend/src/features/decrypt/`.
- [x] T024 [P] [US3] Test exact byte round trips, wrong key, corrupted/truncated/oversized package, unknown version, metadata tampering, and no partial output in `frontend/src/features/decrypt/`.

## Phase 6: User Story 4 — Health check and cohesive accessible UI (P2)

**Goal**: Provide an independently startable backend health endpoint and polished workflows without coupling crypto to server availability.  
**Independent test**: `GET /api/health` returns the contract; stop backend and verify local crypto remains usable.

- [x] T025 [P] [US4] Implement `GET /api/health` response in `backend/src/main/java/`.
- [x] T026 [P] [US4] Add Spring/JUnit test for health status/body and ensure no file/key routes exist in `backend/src/test/java/`.
- [x] T027 [US4] Implement frontend health client and non-blocking unavailable/available indicator in `frontend/src/services/`.
- [x] T028 [US4] Create French single-page navigation, restrained responsive visual system, keyboard flow, and accessible labels/status announcements in `frontend/src/App.tsx`, `frontend/src/App.css`, and `frontend/src/index.css`.
- [x] T029 [P] [US4] Test available/unavailable health states and view navigation that remains usable when the backend is offline in `frontend/src/App.test.tsx`.

## Phase 7: Documentation and end-to-end validation

- [x] T030 Document architecture, RSA/AES roles, public-key verification, lack of sender authentication, HTTPS, secret/log boundaries, memory-erasure limits, `.rsaenc` and `.rsakey` formats in `README.md`.
- [x] T031 Add separate Windows-friendly start/test instructions and document the Vite health proxy and absence of required environment configuration in `README.md`.
- [x] T032 Verify browser keypair generation and encryption UI, byte-for-byte round trip/tamper/password tests, health status, and network boundaries in `frontend/src/` and `backend/src/`.
- [x] T033 Run frontend tests/build and backend tests/package using `frontend/package.json` and `backend/pom.xml`; resolve only feature-introduced failures.

## Phase 8: Local infrastructure and dependencies

**Purpose**: Add the minimum local services and libraries required for verified accounts and live encrypted messages.

- [x] T034 [P] Add loopback-bound PostgreSQL (container 5432 mapped to host 15432 to avoid conflicts) and Mailpit services with a persistent local database volume in `docker-compose.yml`.
- [x] T035 [P] Add Spring Security HTTP/messaging, JDBC, PostgreSQL, Flyway, Mail, WebSocket, and test dependencies to `backend/pom.xml`.
- [x] T036 [P] Add `@stomp/stompjs` and a `/ws` WebSocket proxy to `frontend/package.json` and `frontend/vite.config.ts`.

## Phase 9: Foundational account and transport security

**Purpose**: Establish schema, configuration, CSRF, session, and WebSocket security before implementing either account UI or messaging.

- [x] T037 Create the Flyway account migration in `backend/src/main/resources/db/migration/V1__accounts_and_public_keys.sql` with `id UUID` primary key, unique required `email_normalized VARCHAR(320)`, required `password_hash VARCHAR(255)`, nullable `verified_at`, nullable token digest `BYTEA`, nullable verification expiry, nullable public SPKI key, and required `created_at`.
- [x] T038 Configure PostgreSQL (`clea_dev`/`clea_dev_only` on host port 15432 for local development only), SMTP connect/read/write timeouts, session-cookie settings, and safe local defaults in `backend/src/main/resources/application.yml`; read production secrets only from environment variables.
- [x] T039 Implement same-origin HTTP session, CSRF cookie/token endpoint, secure cookie behavior, and authenticated route rules in `backend/src/main/java/fr/univ/rsafileexchange/config/SecurityConfig.java`.
- [x] T040 Add security configuration tests for anonymous/protected routes, CSRF rejection, and session behavior in `backend/src/test/java/fr/univ/rsafileexchange/config/SecurityConfigTest.java`.

## Phase 10: User Story 5 - Creating and verifying an account (Priority: P1)

**Goal**: Register an email/password account, verify its email once within 24 hours, and permit session login only after verification.

**Independent Test**: With PostgreSQL and fake SMTP, register an account; confirm only an adaptive password hash and token digest are stored; reject login before verification; accept a valid token once; reject invalid, expired, and reused tokens; then log in and log out.

### Tests for User Story 5

- [x] T041 [P] [US5] Test email trim/lowercase normalization, duplicate response privacy, password hashing, SMTP failure, and generic resend behavior limited to one per normalized address/minute and five/hour in `backend/src/test/java/fr/univ/rsafileexchange/account/RegistrationServiceTest.java` and `backend/src/test/java/fr/univ/rsafileexchange/mail/VerificationRateLimiterTest.java`.
- [x] T042 [P] [US5] Test one-use/24-hour verification, atomic token consumption, automatic session creation, unverified login denial, and logout using MockMvc in `backend/src/test/java/fr/univ/rsafileexchange/account/AuthenticationControllerTest.java`.

### Implementation for User Story 5

- [x] T043 [US5] Implement the `Account` record/model and JDBC repository for unique `email_normalized VARCHAR(320)`, adaptive `password_hash VARCHAR(255)`, nullable `verified_at`, token digest/expiry, nullable public key, and `created_at` in `backend/src/main/java/fr/univ/rsafileexchange/account/Account.java` and `AccountRepository.java`.
- [x] T044 [US5] Implement high-entropy verification-token creation, digest-only persistence, exact 24-hour expiry, atomic single-use consume/clear, automatic session creation after verification, SMTP mail delivery, and generic resend responses limited to one per normalized email/minute and five/hour in `backend/src/main/java/fr/univ/rsafileexchange/mail/EmailVerificationService.java`.
- [x] T045 [US5] Implement registration, verification, resend-verification, login/session, logout, and CSRF REST endpoints with input validation and non-sensitive errors in `backend/src/main/java/fr/univ/rsafileexchange/account/AuthController.java`.
- [x] T046 [US5] Implement frontend CSRF/session/auth API handling in `frontend/src/services/authApi.ts`.
- [x] T047 [US5] Build French registration/login/resend/verification/logout UI; consume email tokens from a URL fragment before removing them from browser history and update authenticated state after verification in `frontend/src/features/auth/AuthView.tsx` and `frontend/src/App.tsx`.

**Checkpoint**: An unverified account cannot sign in; verified accounts can establish and invalidate sessions; SMTP failure never marks an account verified.

## Phase 11: User Story 6 - Sending and receiving encrypted messages live (Priority: P1)

**Goal**: Let two verified users with registered RSA public keys exchange a message online-only; encrypt/decrypt in their browsers and display the safe cryptographic demo trace only when explicitly enabled in development.

**Independent Test**: Connect two verified accounts, register and verify their keys, relay a known ciphertext unchanged, and confirm only the addressed connected browser decrypts and displays it. Confirm a disconnected user receives nothing after reconnecting and malformed, tampered, or wrong-key messages never show plaintext.

### Tests for User Story 6

- [x] T048 [P] [US6] Test fresh AES-GCM key/IV per message, RSA-OAEP wrapping, exact plaintext round trip, wrong key/tamper rejection, and ciphertext-only demo data in `frontend/src/crypto/messageEnvelope.test.ts`.
- [x] T049 [P] [US6] Test authenticated sender derivation, allowed STOMP destinations, recipient-only routing, online-subscription requirement, size/schema rejection, and no offline replay in backend messaging tests.
- [x] T050 [P] [US6] Test recipient lookup, public-key validation/ownership, and online status response in `backend/src/test/java/fr/univ/rsafileexchange/account/ContactControllerTest.java`.
- [x] T051 [P] [US6] Test that demo tracing is disabled by default, unavailable in production, and never logs plaintext or full envelopes in `frontend/src/features/chat/cryptoTrace.test.ts`.

### Implementation for User Story 6

- [x] T052 [US6] Implement bounded version-1 message envelope serialization/validation and browser AES-256-GCM encryption with RSA-OAEP/SHA-256 key wrapping in `frontend/src/crypto/messageEnvelope.ts`.
- [x] T053 [US6] Implement authenticated `/ws` STOMP configuration, CSRF-on-CONNECT, origin restrictions, strict inbound destination authorization, message-size limits, and `/user/queue/messages` subscription rules in `backend/src/main/java/fr/univ/rsafileexchange/messaging/WebSocketConfig.java`.
- [x] T054 [US6] Implement validated ciphertext-only relay to a verified account's active private queue, deriving sender from `Principal` and rejecting offline recipients without storing or logging the envelope in backend messaging services.
- [x] T055 [US6] Implement authenticated public-key registration/validation and exact-email recipient lookup returning only verified recipient ID, public key, and online state in `backend/src/main/java/fr/univ/rsafileexchange/account/ContactController.java`.
- [x] T056 [US6] Register the local public key for the authenticated account and display a verifiable SHA-256 fingerprint in `frontend/src/features/keys/` and `frontend/src/services/authApi.ts`.
- [x] T057 [US6] Implement authenticated STOMP connect/subscribe/send and local recipient decryption without persisting message text or keys in `frontend/src/services/messageSocket.ts` and `frontend/src/features/chat/`.
- [x] T058 [US6] Add an explicit development-only trace toggle showing RSA-OAEP/AES-GCM parameters and short ciphertext excerpts while excluding plaintext, full envelopes, keys, passwords, tokens, account IDs, and session data in `frontend/src/features/chat/cryptoTrace.ts` and `frontend/src/features/chat/ChatView.tsx`.
- [x] T059 [US6] Add the accessible French recipient-search/chat view with online/offline, sending, decryption-error, and not-delivered states in `frontend/src/features/chat/ChatView.tsx` and `frontend/src/App.tsx`.

**Checkpoint**: The backend cannot read plaintext, clients cannot route to another user's subscription, and an offline recipient has no message to retrieve later.

## Phase 12: Polish and end-to-end validation

**Purpose**: Preserve the existing file workflows, document the new local setup, and verify all account/messaging acceptance criteria.

- [x] T060 [P] Update `README.md` with verified-account flow, Docker Compose/Mailpit startup, session/CSRF model, live-only relay behavior, cryptographic console demo, production SMTP/HTTPS configuration, and explicit no-offline-delivery limitations.
- [x] T061 Run `frontend` tests, strict production build, and existing lint script; fix regressions in `frontend/`.
- [x] T062 Run Maven unit/integration tests and package against Docker PostgreSQL and Mailpit in `backend/`.
- [x] T063 Complete two-browser-profile registration, email verification, key exchange, live message, offline-recipient, tamper, console-trace, and existing file round-trip checks using `specs/001-rsa-file-exchange/quickstart.md`.
- [x] T064 Inspect the account schema and browser/log behavior to confirm only permitted account/public-key/token-digest data persists and no message/file/private-key/plaintext leaks occur.

## Dependencies and ordering

- T001–T033 are completed baseline work and must remain regression-free.
- T034–T036 establish local services and dependencies; T037–T040 establish the database and security foundation before account/chat stories.
- US5 (T041–T047) depends on Phase 9. US6 (T048–T059) depends on the account/session foundation and verified accounts; message encryption T052 can be implemented independently from backend relay T053–T055 after T036.
- T060–T064 are the final documentation, security, and end-to-end gates and depend on US5 and US6.

## Parallel examples

After T034–T040:

- US5 service tests T041–T042 can be prepared in parallel; repository and verification-service implementations remain ordered by their interfaces.
- US6 browser envelope tests T048 and backend relay tests T049 can proceed in parallel; contact tests T050 are independent of message crypto.
- After the account foundation, one student can implement auth/backend while the other prepares browser message crypto and the chat UI contract.
- Final browser validation T063 must use two separate browser profiles and Docker services; it cannot be replaced by a single-client unit test.

## Implementation strategy

The file/key exchange (T001–T033) is the already delivered baseline. Add Docker and security foundations first, then verified accounts as a functional increment, followed by the live encrypted relay and UI. Keep file crypto independent of backend availability. Finish with two-browser integration and data/log boundary checks; do not claim reliable or offline delivery.
