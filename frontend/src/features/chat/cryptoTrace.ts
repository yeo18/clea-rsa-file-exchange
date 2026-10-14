import { base64ToBytes } from '../../crypto/bytes'
import type { MessageEnvelope } from '../../crypto/messageEnvelope'

export function isCryptoTraceAvailable(): boolean {
  return import.meta.env.DEV
}

export function logCryptoTrace(envelope: MessageEnvelope, enabled: boolean): void {
  if (!enabled || !isCryptoTraceAvailable()) return

  const wrappedKey = base64ToBytes(envelope.keyEncryption.wrappedKey, 384)
  const ciphertext = base64ToBytes(envelope.ciphertext, 8 * 1024 + 16)
  console.info('[Cléa] Démonstration du chiffrement hybride', {
    keyWrapping: 'RSA-OAEP / SHA-256',
    wrappedAesKeyBytes: wrappedKey.length,
    wrappedAesKeySample: envelope.keyEncryption.wrappedKey.slice(0, 32),
    messageEncryption: 'AES-256-GCM',
    ivBytes: 12,
    ciphertextBytes: ciphertext.length,
    ciphertextSample: envelope.ciphertext.slice(0, 48),
  })
}
