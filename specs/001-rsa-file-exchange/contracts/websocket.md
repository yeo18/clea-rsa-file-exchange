# Live Message STOMP Contract

WebSocket endpoint: `/ws` on the same origin as the application. Development uses the Vite WebSocket proxy. The HTTP handshake requires the authenticated session cookie and an allowed origin.

The browser obtains the CSRF token through `GET /api/auth/csrf` and supplies it in the STOMP `CONNECT` frame. Only verified, authenticated accounts can connect. Authentication identity always comes from the server-side HTTP session.

## Client destinations

- Subscribe to `/user/queue/messages`.
- Send only to `/app/messages`.
- A client must not publish directly to `/queue/**`, `/topic/**`, or `/user/**`.
- The sender is derived from the authenticated principal. The client supplies only the recipient account UUID and a versioned encrypted envelope.

## Send body

```json
{
  "recipientId": "uuid",
  "envelope": {
    "version": 1,
    "keyEncryption": {
      "name": "RSA-OAEP",
      "hash": "SHA-256",
      "wrappedKey": "base64"
    },
    "contentEncryption": {
      "name": "AES-GCM",
      "length": 256,
      "iv": "base64",
      "tagLength": 128
    },
    "ciphertext": "base64"
  }
}
```

The server verifies that the recipient exists, has a public key, and has an active subscription to the private message queue. It routes the same envelope to that recipient without decrypting, rewriting, logging, persisting, or queueing it. Otherwise it returns a non-sensitive error to the sender and discards the envelope.

## Delivery and limits

- Messages are best-effort live delivery, not durable or exactly-once. If the receiver disconnects before relay, no message is stored or replayed.
- The server derives sender identity from the authenticated session, validates recipient UUID and the envelope version/schema/algorithms/encoded field limits, and limits the full STOMP message size.
- The recipient receives the same encrypted envelope on `/user/queue/messages` and decrypts it locally. A failed AES-GCM authentication shows no partial plaintext.
- No sender-provided email, sender ID, plaintext, attachment, or delivery-history field is trusted or stored.
- Browser console tracing is development-only and opt-in; it must never print plaintext, secrets, account/session identifiers, or full message payloads.
