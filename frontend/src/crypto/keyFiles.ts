import {
  base64ToBytes,
  bytesToBase64,
  decodeUtf8,
  encodeUtf8,
} from './bytes'
import { CryptoInputError, CryptoOperationError } from './errors'

const RSA_HASH = 'SHA-256'
const RSA_MODULUS_LENGTH = 3072
const PBKDF2_ITERATIONS = 600_000
const SALT_LENGTH = 16
const GCM_IV_LENGTH = 12
const GCM_TAG_LENGTH = 128
const MAX_PROTECTED_KEY_FILE_BYTES = 64 * 1024
const PUBLIC_KEY_HEADER = '-----BEGIN PUBLIC KEY-----'
const PUBLIC_KEY_FOOTER = '-----END PUBLIC KEY-----'

type ProtectedKeyHeader = {
  format: 'rsa-file-exchange-private-key'
  version: 1
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    salt: string
  }
  cipher: {
    name: 'AES-GCM'
    length: 256
    iv: string
    tagLength: 128
  }
}

export type RecipientKeys = CryptoKeyPair & {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

export async function generateRecipientKeys(): Promise<RecipientKeys> {
  const result = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: RSA_MODULUS_LENGTH,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: RSA_HASH,
    },
    true,
    ['wrapKey', 'unwrapKey'],
  )

  return {
    publicKey: result.publicKey,
    privateKey: result.privateKey,
  }
}

export function assertRsaPublicKey(key: CryptoKey): void {
  assertRsaKey(key, 'public', 'wrapKey')
}

export function assertRsaPrivateKey(key: CryptoKey): void {
  assertRsaKey(key, 'private', 'unwrapKey')
}

export async function exportPublicKeyPem(publicKey: CryptoKey): Promise<Blob> {
  assertRsaPublicKey(publicKey)
  const der = new Uint8Array(await crypto.subtle.exportKey('spki', publicKey))
  const base64 = bytesToBase64(der)
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? base64
  return new Blob([`${PUBLIC_KEY_HEADER}\n${lines}\n${PUBLIC_KEY_FOOTER}\n`], {
    type: 'application/x-pem-file',
  })
}

export async function importPublicKeyPem(file: File): Promise<CryptoKey> {
  if (file.size > 16 * 1024) {
    throw new CryptoInputError('Le fichier de clé publique est trop volumineux.')
  }

  return importPublicKeyPemText(await file.text())
}

export async function importPublicKeyPemText(text: string): Promise<CryptoKey> {
  if (text.length > 16 * 1024) {
    throw new CryptoInputError('La clé publique est trop volumineuse.')
  }
  if (!text.startsWith(PUBLIC_KEY_HEADER) || !text.trimEnd().endsWith(PUBLIC_KEY_FOOTER)) {
    throw new CryptoInputError('Choisissez une clé publique RSA au format SPKI PEM.')
  }

  const base64 = text
    .replace(PUBLIC_KEY_HEADER, '')
    .replace(PUBLIC_KEY_FOOTER, '')
    .replace(/\s/g, '')
  const der = base64ToBytes(base64, 8 * 1024)
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey(
      'spki',
      der,
      { name: 'RSA-OAEP', hash: RSA_HASH },
      true,
      ['wrapKey'],
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'DataError') {
      throw new CryptoInputError('La clé publique RSA est invalide ou incompatible.')
    }
    throw error
  }
  assertRsaPublicKey(key)
  return key
}

export async function getPublicKeyFingerprint(publicKey: CryptoKey): Promise<string> {
  const der = await crypto.subtle.exportKey('spki', publicKey)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase()
}

export async function exportProtectedPrivateKey(
  privateKey: CryptoKey,
  passphrase: string,
): Promise<Blob> {
  assertRsaPrivateKey(privateKey)
  validatePassphrase(passphrase)

  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH))
  const header: ProtectedKeyHeader = {
    format: 'rsa-file-exchange-private-key',
    version: 1,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      length: 256,
      iv: bytesToBase64(iv),
      tagLength: GCM_TAG_LENGTH,
    },
  }

  try {
    const key = await deriveProtectionKey(passphrase, salt, ['encrypt'])
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: encodeUtf8(JSON.stringify(header)),
        tagLength: GCM_TAG_LENGTH,
      },
      key,
      pkcs8,
    )
    const envelope = { ...header, ciphertext: bytesToBase64(new Uint8Array(ciphertext)) }
    return new Blob([JSON.stringify(envelope)], { type: 'application/json' })
  } finally {
    pkcs8.fill(0)
  }
}

export async function importProtectedPrivateKey(file: File, passphrase: string): Promise<CryptoKey> {
  if (file.size === 0 || file.size > MAX_PROTECTED_KEY_FILE_BYTES) {
    throw new CryptoInputError('Le fichier de clé privée est vide ou trop volumineux.')
  }
  if (!passphrase) {
    throw new CryptoInputError('Saisissez le mot de passe de protection de la clé privée.')
  }

  const record = parseRecord(decodeUtf8(new Uint8Array(await file.arrayBuffer())))
  const header = parseProtectedKeyHeader(record)
  const ciphertext = base64ToBytes(
    requiredString(record, 'ciphertext'),
    MAX_PROTECTED_KEY_FILE_BYTES,
  )
  const salt = base64ToBytes(header.kdf.salt, SALT_LENGTH)
  const iv = base64ToBytes(header.cipher.iv, GCM_IV_LENGTH)
  if (
    salt.length !== SALT_LENGTH ||
    iv.length !== GCM_IV_LENGTH ||
    ciphertext.length < GCM_IV_LENGTH + GCM_TAG_LENGTH / 8
  ) {
    throw new CryptoInputError('Les paramètres du fichier de clé privée sont invalides.')
  }

  let plaintext: Uint8Array<ArrayBuffer>
  try {
    const key = await deriveProtectionKey(passphrase, salt, ['decrypt'])
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: encodeUtf8(JSON.stringify(header)),
          tagLength: GCM_TAG_LENGTH,
        },
        key,
        ciphertext,
      ),
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'OperationError') {
      throw new CryptoOperationError('Mot de passe incorrect ou fichier de clé privée altéré.')
    }
    throw error
  }

  try {
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      plaintext,
      { name: 'RSA-OAEP', hash: RSA_HASH },
      false,
      ['unwrapKey'],
    )
    assertRsaPrivateKey(privateKey)
    return privateKey
  } catch (error) {
    if (error instanceof DOMException && error.name === 'DataError') {
      throw new CryptoInputError('La clé privée protégée est invalide ou incompatible.')
    }
    throw error
  } finally {
    plaintext.fill(0)
  }
}

function validatePassphrase(passphrase: string): void {
  if ([...passphrase].length < 12) {
    throw new CryptoInputError('Le mot de passe doit contenir au moins 12 caractères.')
  }
}

async function deriveProtectionKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const passwordBytes = encodeUtf8(passphrase)
  try {
    const material = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveKey'],
    )
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: RSA_HASH, salt, iterations: PBKDF2_ITERATIONS },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      usages,
    )
  } finally {
    passwordBytes.fill(0)
  }
}

function assertRsaKey(key: CryptoKey, type: 'public' | 'private', usage: KeyUsage): void {
  const algorithm = key.algorithm
  const validHash =
    'hash' in algorithm &&
    typeof algorithm.hash === 'object' &&
    algorithm.hash !== null &&
    'name' in algorithm.hash &&
    algorithm.hash.name === RSA_HASH
  const validExponent =
    'publicExponent' in algorithm &&
    algorithm.publicExponent instanceof Uint8Array &&
    algorithm.publicExponent.length === 3 &&
    algorithm.publicExponent[0] === 1 &&
    algorithm.publicExponent[1] === 0 &&
    algorithm.publicExponent[2] === 1
  if (
    key.type !== type ||
    !key.usages.includes(usage) ||
    algorithm.name !== 'RSA-OAEP' ||
    !('modulusLength' in algorithm) ||
    algorithm.modulusLength !== RSA_MODULUS_LENGTH ||
    !validHash ||
    !validExponent
  ) {
    throw new CryptoInputError('La clé RSA est incompatible avec les paramètres requis.')
  }
}

function parseRecord(text: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CryptoInputError('Le fichier de clé privée est mal formé.')
    }
    throw error
  }
  if (!isRecord(parsed)) {
    throw new CryptoInputError('Le fichier de clé privée est mal formé.')
  }
  return parsed
}

function parseProtectedKeyHeader(record: Record<string, unknown>): ProtectedKeyHeader {
  const { format, version, kdf, cipher, ciphertext, ...unknownFields } = record
  if (
    Object.keys(unknownFields).length > 0 ||
    format !== 'rsa-file-exchange-private-key' ||
    version !== 1 ||
    typeof ciphertext !== 'string' ||
    typeof kdf !== 'object' ||
    kdf === null ||
    Array.isArray(kdf) ||
    typeof cipher !== 'object' ||
    cipher === null ||
    Array.isArray(cipher)
  ) {
    throw new CryptoInputError('Format de fichier de clé privée non pris en charge.')
  }

  const kdfRecord = kdf as Record<string, unknown>
  const cipherRecord = cipher as Record<string, unknown>
  if (
    !hasExactKeys(kdfRecord, ['name', 'hash', 'iterations', 'salt']) ||
    kdfRecord.name !== 'PBKDF2' ||
    kdfRecord.hash !== RSA_HASH ||
    kdfRecord.iterations !== PBKDF2_ITERATIONS ||
    typeof kdfRecord.salt !== 'string' ||
    !hasExactKeys(cipherRecord, ['name', 'length', 'iv', 'tagLength']) ||
    cipherRecord.name !== 'AES-GCM' ||
    cipherRecord.length !== 256 ||
    typeof cipherRecord.iv !== 'string' ||
    cipherRecord.tagLength !== GCM_TAG_LENGTH
  ) {
    throw new CryptoInputError('Paramètres de protection de clé non pris en charge.')
  }

  return {
    format,
    version,
    kdf: {
      name: 'PBKDF2',
      hash: RSA_HASH,
      iterations: PBKDF2_ITERATIONS,
      salt: kdfRecord.salt,
    },
    cipher: {
      name: 'AES-GCM',
      length: 256,
      iv: cipherRecord.iv,
      tagLength: GCM_TAG_LENGTH,
    },
  }
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new CryptoInputError('Le fichier de clé privée est mal formé.')
  }
  return value
}

function hasExactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(record).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
