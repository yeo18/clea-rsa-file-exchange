# RSA File Exchange Constitution

## Core Principles

### I. Confidentiality by Design
File contents, message plaintext, private keys, and private-key passwords remain in the user's browser. The backend may persist only account identifiers, normalized email, adaptive password hashes, verification-token digests, and public keys. It may transiently relay bounded ciphertext only to an online recipient; it must never decrypt, persist, or log message ciphertext or sensitive account tokens.

### II. Standard Cryptography Only
Use browser Web Crypto API primitives with explicit, documented parameters: RSA-OAEP/SHA-256 for wrapping a fresh AES key, AES-256-GCM for file and message confidentiality and integrity, and PBKDF2/SHA-256 with AES-GCM to protect exported PKCS#8 private-key bytes. Never implement cryptographic primitives or claim that encryption authenticates the sender.

### III. Testable Security and Correctness
Test key import/export, encryption/decryption round trips, tamper rejection, malformed input handling, the health endpoint, and the user-visible failure states. Do not claim a security or behavior guarantee without a corresponding test or explicit documented limitation.

### IV. Simple, User-Understandable Product
Deliver the file exchange, key lifecycle, verified accounts, live encrypted messaging required by the instructor, and justified health-check capabilities. Messages are direct and online-only, with no mailbox or history. Prefer explicit French labels, accessible controls, clear progress and actionable errors, and a restrained responsive interface. Do not add analytics or unrelated dashboards.

### V. Small, Separated Applications
Keep the React/TypeScript/Vite frontend and Java/Spring Boot backend in separate directories. Keep cryptography and file handling in frontend feature modules; keep account/session management and ciphertext-only live relay in the backend. Add dependencies only for a demonstrated need.

## Technical and Security Constraints

- Use strict TypeScript, Java 21 source compatibility, Maven, and JUnit 5.
- Use RSA-OAEP with SHA-256 and a 3072-bit key by default; use a new AES-256-GCM key and 96-bit IV for every encrypted file.
- Protect private-key exports with a password-derived AES-256-GCM key; never offer a plaintext private-key download.
- Use a versioned `.rsaenc` container, authenticate its header as AES-GCM additional authenticated data, and reject unsupported versions or unsafe sizes before expensive processing.
- Enforce a documented 50 MiB plaintext size limit because Web Crypto processes file buffers in memory.
- Require a secure browser context (HTTPS in production; localhost for development). Never log file contents, passwords, or private keys.
- The backend may accept account credentials over authenticated HTTPS, email verification tokens, public keys, and bounded encrypted message envelopes. It must never accept files, private keys, private-key passwords, or plaintext messages.
- Persist only account data and public keys in PostgreSQL. Never create message/file persistence or offline queues. Verification tokens are single-use, expire after 24 hours, and are stored only as digests.
- Authenticate WebSocket handshakes with the HTTP session, authorize STOMP send/subscribe destinations, require CSRF protection, and restrict allowed origins. The single-instance in-memory relay is best-effort and online-only.
- The console is silent by default. Any cryptographic demonstration trace must be explicitly enabled in development and must omit plaintext, credentials, tokens, private keys, identifiers, and full message payloads.

## Development and Quality Gates

- Maintain Spec Kit constitution, specification, plan, research/design artifacts, and dependency-ordered tasks.
- Keep frontend and backend independently runnable and document Docker Compose services, SMTP configuration, account/messaging startup, tests, and cryptographic formats.
- Before completion, run the available targeted tests and production builds for both applications; verify the browser round trip and authenticated tamper rejection.
- Review changes against this constitution and the specification before implementation is considered complete.

## Governance

This constitution governs project decisions. If a requirement conflicts with it, record the conflict and resolve it explicitly before implementation; do not silently weaken a security principle. Amendments must be documented and versioned. Simpler alternatives must be preferred unless a concrete requirement justifies additional complexity.

**Version**: 1.1.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
