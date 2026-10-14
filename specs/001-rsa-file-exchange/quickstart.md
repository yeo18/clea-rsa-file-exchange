# Quickstart

## Prerequisites

- Node.js 24+ and npm 11+
- Java 21+ and Maven 3.9+
- Docker Desktop with Docker Compose

## Start local database and mail capture

From the repository root:

```powershell
docker compose up -d
```

PostgreSQL is available only on `127.0.0.1:15432` with the local-only `clea_dev` database/user and `clea_dev_only` password (container port 5432). Host port 15432 avoids disturbing PostgreSQL containers already using 5432 and 5433. Mailpit captures SMTP at `127.0.0.1:1025`; open its inbox at `http://127.0.0.1:8025`. These defaults are for local development only; production credentials must come from environment variables.

## Start the backend

Configure the local datasource and SMTP settings using the documented development defaults or environment variables (never production credentials in source control). Then:

```powershell
Set-Location backend
mvn spring-boot:run
```

Flyway creates/updates the account schema. Verify:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
```

Expected response: `status: UP`.

## Start the frontend

In another terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually `http://localhost:5173`). Vite proxies `/api` and `/ws` to the backend. Localhost is a secure context for Web Crypto.

## Validate email and live messaging

1. Register two different email addresses.
2. Open Mailpit at `http://127.0.0.1:8025`, open each message, and follow the verification link; successful verification establishes the browser session.
3. In two separate browser profiles, verify each account in that profile so both establish authenticated sessions.
4. Generate/import each person's RSA keys, register their public key, and keep the private key and its passphrase only in that browser.
5. Search the recipient by exact email and verify the public-key fingerprint with them through a separate channel.
6. Send a short message. Inspect browser developer tools: the WebSocket carries a versioned AES-GCM ciphertext envelope and routing metadata, not plaintext. Confirm the recipient sees it only after local decryption.
7. Disconnect the recipient and try to send again; the sender must see a delivery failure, and reconnecting must not reveal the message.
8. Enable the explicit development-only cryptographic demo toggle, send again, and confirm the console shows algorithms and a short ciphertext sample but no plaintext, passwords, tokens, private keys, IDs, or session data.
9. Repeat the existing file round trip and tamper tests; inspect network requests to confirm files/private keys never leave the browser.

## Tests

```powershell
Set-Location frontend
npm test
npm run build
npm run lint
```

```powershell
Set-Location backend
mvn test
mvn package
```

Backend tests use an injected/fake mail sender for token lifecycle and SMTP-failure paths, PostgreSQL-backed account and relay-service tests, and STOMP destination/validation tests. Run the actual two-profile WebSocket exchange manually using steps 1–8 above. See the [REST contract](contracts/openapi.yaml), [STOMP contract](contracts/websocket.md), and [data model](data-model.md).

## Stop local services

```powershell
docker compose down
```

Use `docker compose down -v` only when intentionally deleting all local account records from the development database.
