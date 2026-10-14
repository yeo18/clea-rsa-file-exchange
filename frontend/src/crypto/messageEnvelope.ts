import { base64ToBytes, bytesToBase64, encodeUtf8 } from './bytes'
import { CryptoInputError, CryptoOperationError } from './errors'
import { assertRsaPrivateKey, assertRsaPublicKey } from './keyFiles'

const RSA_WRAPPED_KEY_BYTES = 384
const AES_KEY_BYTES = 32
const GCM_IV_BYTES = 12
const GCM_TAG_BYTES = 16
export const MAX_MESSAGE_BYTES = 8 * 1024

export type MessageEnvelope = {
  version: 1
  keyEncryption: {
    name: 'RSA-OAEP'
    hash: 'SHA-256'
    wrappedKey: string
  }
  contentEncryption: {
    name: 'AES-GCM'
    length: 256
    iv: string
    tagLength: 128
  }
  ciphertext: string
}

export async function encryptMessage(
  message: string,
  recipientPublicKey: CryptoKey,
): Promise<MessageEnvelope> {
  assertRsaPublicKey(recipientPublicKey)
  const plaintext = encodeUtf8(message)
  if (plaintext.length === 0 || plaintext.length > MAX_MESSAGE_BYTES) {
    throw new CryptoInputError('Le message doit contenir de 1 à 8 Kio.')
  }

  const contentKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES))
  const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    contentKey,
    recipientPublicKey,
    { name: 'RSA-OAEP' },
  )
  const keyEncryption: MessageEnvelope['keyEncryption'] = {
    name: 'RSA-OAEP',
    hash: 'SHA-256',
    wrappedKey: bytesToBase64(new Uint8Array(wrappedKey)),
  }
  const contentEncryption: MessageEnvelope['contentEncryption'] = {
    name: 'AES-GCM',
    length: 256,
    iv: bytesToBase64(iv),
    tagLength: 128,
  }
  const header = serializeHeader(keyEncryption, contentEncryption)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: header,
      tagLength: 128,
    },
    contentKey,
    plaintext,
  )

  return {
    version: 1,
    keyEncryption,
    contentEncryption,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptMessage(
  input: unknown,
  recipientPrivateKey: CryptoKey,
): Promise<string> {
  assertRsaPrivateKey(recipientPrivateKey)
  const envelope = parseMessageEnvelope(input)
  const wrappedKey = base64ToBytes(envelope.keyEncryption.wrappedKey, RSA_WRAPPED_KEY_BYTES)
  const iv = base64ToBytes(envelope.contentEncryption.iv, GCM_IV_BYTES)
  const ciphertext = base64ToBytes(
    envelope.ciphertext,
    MAX_MESSAGE_BYTES + GCM_TAG_BYTES,
  )
  if (
    wrappedKey.length !== RSA_WRAPPED_KEY_BYTES
    || iv.length !== GCM_IV_BYTES
    || ciphertext.length < GCM_TAG_BYTES
  ) {
    throw new CryptoInputError('Le message chiffré est invalide.')
  }

  try {
    const contentKey = await crypto.subtle.unwrapKey(
      'raw',
      wrappedKey,
      recipientPrivateKey,
      { name: 'RSA-OAEP' },
      { name: 'AES-GCM', length: AES_KEY_BYTES * 8 },
      false,
      ['decrypt'],
    )
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: serializeHeader(envelope.keyEncryption, envelope.contentEncryption),
        tagLength: 128,
      },
      contentKey,
      ciphertext,
    )
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
  } catch {
    throw new CryptoOperationError('Ce message ne peut pas être déchiffré avec cette clé.')
  }
}

export function parseMessageEnvelope(input: unknown): MessageEnvelope {
  if (!isRecord(input)) {
    throw new CryptoInputError('Le format du message chiffré est invalide.')
  }

  const keyEncryption = input.keyEncryption
  const contentEncryption = input.contentEncryption
  if (
    input.version !== 1
    || !isRecord(keyEncryption)
    || keyEncryption.name !== 'RSA-OAEP'
    || keyEncryption.hash !== 'SHA-256'
    || typeof keyEncryption.wrappedKey !== 'string'
    || !isRecord(contentEncryption)
    || contentEncryption.name !== 'AES-GCM'
    || contentEncryption.length !== 256
    || contentEncryption.tagLength !== 128
    || typeof contentEncryption.iv !== 'string'
    || typeof input.ciphertext !== 'string'
  ) {
    throw new CryptoInputError('Le format du message chiffré est invalide.')
  }

  return {
    version: 1,
    keyEncryption: {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
      wrappedKey: keyEncryption.wrappedKey,
    },
    contentEncryption: {
      name: 'AES-GCM',
      length: 256,
      iv: contentEncryption.iv,
      tagLength: 128,
    },
    ciphertext: input.ciphertext,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function serializeHeader(
  keyEncryption: MessageEnvelope['keyEncryption'],
  contentEncryption: MessageEnvelope['contentEncryption'],
): Uint8Array<ArrayBuffer> {
  return encodeUtf8(JSON.stringify({
    version: 1,
    keyEncryption,
    contentEncryption,
  }))
}
