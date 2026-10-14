// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest'
import {
  assertEncryptedPayloadSize,
  assertFileSize,
  decryptContainer,
  encryptFileToContainer,
  MAX_FILE_SIZE,
} from './fileContainer'
import {
  exportProtectedPrivateKey,
  exportPublicKeyPem,
  generateRecipientKeys,
  getPublicKeyFingerprint,
  importProtectedPrivateKey,
  importPublicKeyPem,
  type RecipientKeys,
} from './keyFiles'
import { CryptoInputError, CryptoOperationError } from './errors'

const passphrase = 'correct horse battery staple'
let keys: RecipientKeys
let unrelatedKeys: RecipientKeys

beforeAll(async () => {
  keys = await generateRecipientKeys()
  unrelatedKeys = await generateRecipientKeys()
})

describe('RSA-OAEP key files', () => {
  it('exports and imports a SPKI public key with the same fingerprint', async () => {
    const pem = await exportPublicKeyPem(keys.publicKey)
    const publicKeyFile = new File([pem], 'recipient.pem')
    const imported = await importPublicKeyPem(publicKeyFile)

    expect(imported.algorithm.name).toBe('RSA-OAEP')
    expect(await getPublicKeyFingerprint(imported)).toBe(
      await getPublicKeyFingerprint(keys.publicKey),
    )
  })

  it('rejects an invalid public-key file', async () => {
    await expect(
      importPublicKeyPem(new File(['not a public key'], 'invalid.pem')),
    ).rejects.toBeInstanceOf(CryptoInputError)
  })

  it('protects PKCS#8 private-key bytes and rejects a wrong passphrase', async () => {
    const protectedFile = await exportProtectedPrivateKey(keys.privateKey, passphrase)
    const keyFile = new File([protectedFile], 'recipient.rsakey')
    const imported = await importProtectedPrivateKey(keyFile, passphrase)

    expect(imported.extractable).toBe(false)
    expect(imported.type).toBe('private')
    await expect(importProtectedPrivateKey(keyFile, 'incorrect password')).rejects.toBeInstanceOf(
      CryptoOperationError,
    )
  })

  it('rejects an edited authenticated private-key envelope', async () => {
    const protectedFile = await exportProtectedPrivateKey(keys.privateKey, passphrase)
    const envelope = JSON.parse(await protectedFile.text()) as { ciphertext: string }
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -4)}AAAA`
    const edited = new File([JSON.stringify(envelope)], 'edited.rsakey')

    await expect(importProtectedPrivateKey(edited, passphrase)).rejects.toBeInstanceOf(
      CryptoOperationError,
    )
  })

  it('rejects an unprotected private-key export request with a short password', async () => {
    await expect(exportProtectedPrivateKey(keys.privateKey, 'too short')).rejects.toBeInstanceOf(
      CryptoInputError,
    )
  })
})

describe('RSAENC file exchange', () => {
  it('restores file bytes, name, and MIME type exactly', async () => {
    const source = new File([new Uint8Array([0, 1, 127, 128, 255])], 'rapport.bin', {
      type: 'application/octet-stream',
    })
    const encrypted = await encryptFileToContainer(source, keys.publicKey)
    const encryptedFile = new File([encrypted], 'rapport.bin.rsaenc')
    const restored = await decryptContainer(encryptedFile, keys.privateKey)

    expect(Array.from(restored.bytes)).toEqual([0, 1, 127, 128, 255])
    expect(restored.name).toBe('rapport.bin')
    expect(restored.mimeType).toBe('application/octet-stream')
  })

  it('supports an empty file and authenticates header and encrypted bytes', async () => {
    const encrypted = await encryptFileToContainer(
      new File([], 'vide.txt', { type: 'text/plain' }),
      keys.publicKey,
    )
    const validFile = new File([encrypted], 'vide.txt.rsaenc')
    const restored = await decryptContainer(validFile, keys.privateKey)
    expect(restored.bytes).toHaveLength(0)

    const original = new Uint8Array(await encrypted.arrayBuffer())
    const headerLength = new DataView(original.buffer).getUint32(8, false)
    const headerStart = 12
    const marker = new TextEncoder().encode('vide.txt')
    const markerOffset = findBytes(original, marker, headerStart, headerStart + headerLength)
    expect(markerOffset).toBeGreaterThanOrEqual(headerStart)
    original[markerOffset] ^= 1
    const changedHeader = new File([original], 'modified.rsaenc')
    await expect(decryptContainer(changedHeader, keys.privateKey)).rejects.toBeInstanceOf(
      CryptoOperationError,
    )

    const payloadPackage = await encryptFileToContainer(
      new File([new Uint8Array([1, 2, 3])], 'payload.bin'),
      keys.publicKey,
    )
    const changedPayload = new Uint8Array(await payloadPackage.arrayBuffer())
    const payloadHeaderLength = new DataView(changedPayload.buffer).getUint32(8, false)
    changedPayload[12 + payloadHeaderLength] ^= 1
    await expect(
      decryptContainer(new File([changedPayload], 'modified.rsaenc'), keys.privateKey),
    ).rejects.toBeInstanceOf(CryptoOperationError)
  })

  it('rejects unsupported private-key protection parameters before deriving a key', async () => {
    const protectedFile = await exportProtectedPrivateKey(keys.privateKey, passphrase)
    const envelope = JSON.parse(await protectedFile.text()) as {
      kdf: { iterations: number }
    }
    envelope.kdf.iterations = 1
    const unsupported = new File([JSON.stringify(envelope)], 'unsupported.rsakey')

    await expect(importProtectedPrivateKey(unsupported, passphrase)).rejects.toBeInstanceOf(
      CryptoInputError,
    )
  })

  it('rejects a different recipient private key', async () => {
    const source = new File([new Uint8Array([4, 5, 6])], 'secret.bin')
    const encrypted = await encryptFileToContainer(source, keys.publicKey)

    await expect(
      decryptContainer(new File([encrypted], 'secret.rsaenc'), unrelatedKeys.privateKey),
    ).rejects.toBeInstanceOf(CryptoOperationError)
  })

  it('rejects malformed containers and files above the supported limit', async () => {
    await expect(
      decryptContainer(new File([new Uint8Array(30)], 'bad.rsaenc'), keys.privateKey),
    ).rejects.toBeInstanceOf(CryptoInputError)
    expect(() => assertFileSize(MAX_FILE_SIZE + 1)).toThrow(CryptoInputError)
    expect(() => assertEncryptedPayloadSize(MAX_FILE_SIZE + 17)).toThrow(CryptoInputError)
  })

  it('rejects truncated packages and unknown format versions', async () => {
    const encrypted = await encryptFileToContainer(
      new File([new Uint8Array([7, 8, 9])], 'version.bin'),
      keys.publicKey,
    )
    const bytes = new Uint8Array(await encrypted.arrayBuffer())
    const metadataLength = new DataView(bytes.buffer).getUint32(8, false)
    const headerEnd = 12 + metadataLength

    const truncated = new File([bytes.slice(0, headerEnd + 15)], 'truncated.rsaenc')
    await expect(decryptContainer(truncated, keys.privateKey)).rejects.toBeInstanceOf(
      CryptoInputError,
    )

    const metadata = JSON.parse(
      new TextDecoder().decode(bytes.slice(12, headerEnd)),
    ) as { version: number }
    metadata.version = 2
    const unsupportedHeader = new TextEncoder().encode(JSON.stringify(metadata))
    expect(unsupportedHeader).toHaveLength(metadataLength)
    bytes.set(unsupportedHeader, 12)
    await expect(
      decryptContainer(new File([bytes], 'unknown-version.rsaenc'), keys.privateKey),
    ).rejects.toBeInstanceOf(CryptoInputError)
  })
})

function findBytes(
  source: Uint8Array<ArrayBuffer>,
  target: Uint8Array<ArrayBuffer>,
  start: number,
  end: number,
): number {
  for (let offset = start; offset <= end - target.length; offset += 1) {
    if (target.every((byte, index) => source[offset + index] === byte)) return offset
  }
  return -1
}
