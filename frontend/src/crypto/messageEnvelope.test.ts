// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest'
import { CryptoInputError, CryptoOperationError } from './errors'
import { decryptMessage, encryptMessage, type MessageEnvelope } from './messageEnvelope'
import { generateRecipientKeys, type RecipientKeys } from './keyFiles'

let recipient: RecipientKeys
let unrelated: RecipientKeys

beforeAll(async () => {
  recipient = await generateRecipientKeys()
  unrelated = await generateRecipientKeys()
})

describe('hybrid encrypted messages', () => {
  it('encrypts and restores UTF-8 message text for the recipient', async () => {
    const envelope = await encryptMessage('Bonjour, binôme 👋', recipient.publicKey)

    await expect(decryptMessage(envelope, recipient.privateKey))
      .resolves.toBe('Bonjour, binôme 👋')
    expect(envelope.keyEncryption.name).toBe('RSA-OAEP')
    expect(envelope.contentEncryption.name).toBe('AES-GCM')
    expect(envelope.ciphertext).not.toContain('Bonjour')
  })

  it('uses fresh wrapped AES keys and IVs for each message', async () => {
    const first = await encryptMessage('message A', recipient.publicKey)
    const second = await encryptMessage('message A', recipient.publicKey)

    expect(first.keyEncryption.wrappedKey).not.toBe(second.keyEncryption.wrappedKey)
    expect(first.contentEncryption.iv).not.toBe(second.contentEncryption.iv)
  })

  it('rejects a different private key and altered authenticated metadata', async () => {
    const envelope = await encryptMessage('secret', recipient.publicKey)

    await expect(decryptMessage(envelope, unrelated.privateKey))
      .rejects.toBeInstanceOf(CryptoOperationError)

    const altered: MessageEnvelope = {
      ...envelope,
      contentEncryption: { ...envelope.contentEncryption, iv: 'AAAAAAAAAAAAAAAA' },
    }
    await expect(decryptMessage(altered, recipient.privateKey))
      .rejects.toBeInstanceOf(CryptoOperationError)
  })

  it('rejects invalid versions, malformed ciphertext, and oversized messages', async () => {
    const envelope = await encryptMessage('valid', recipient.publicKey)

    await expect(decryptMessage({ ...envelope, version: 2 }, recipient.privateKey))
      .rejects.toBeInstanceOf(CryptoInputError)
    await expect(encryptMessage('x'.repeat(8193), recipient.publicKey))
      .rejects.toBeInstanceOf(CryptoInputError)
    await expect(decryptMessage({ ...envelope, ciphertext: '***' }, recipient.privateKey))
      .rejects.toBeInstanceOf(CryptoInputError)
  })
})
