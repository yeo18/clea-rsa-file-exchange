import {
  base64ToBytes,
  bytesToBase64,
  concatenateBytes,
  decodeUtf8,
  encodeUtf8,
  toSafeFileName,
  toSafeMimeType,
} from './bytes'
import { CryptoInputError, CryptoOperationError } from './errors'
import { assertRsaPrivateKey, assertRsaPublicKey } from './keyFiles'

export const MAX_FILE_SIZE = 50 * 1024 * 1024

const MAGIC = encodeUtf8('RSAENC01')
const FIXED_HEADER_LENGTH = 12
const MAX_METADATA_LENGTH = 8192
const GCM_IV_LENGTH = 12
const GCM_TAG_LENGTH = 128
const GCM_TAG_BYTES = GCM_TAG_LENGTH / 8
const MAX_PACKAGE_SIZE =
  MAX_FILE_SIZE + FIXED_HEADER_LENGTH + MAX_METADATA_LENGTH + GCM_TAG_BYTES

type ContainerMetadata = {
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
  originalFileName?: string
  originalMimeType?: string
}

export type RestoredFile = {
  bytes: Uint8Array<ArrayBuffer>
  name: string
  mimeType: string
}

export function assertFileSize(size: number): void {
  if (size > MAX_FILE_SIZE) {
    throw new CryptoInputError('La taille maximale prise en charge est de 50 Mio.')
  }
}

export function assertEncryptedPayloadSize(size: number): void {
  if (size < GCM_TAG_BYTES || size > MAX_FILE_SIZE + GCM_TAG_BYTES) {
    throw new CryptoInputError('Le contenu du paquet dépasse la taille maximale autorisée.')
  }
}

export async function encryptFileToContainer(
  file: File,
  recipientPublicKey: CryptoKey,
): Promise<Blob> {
  assertFileSize(file.size)
  assertRsaPublicKey(recipientPublicKey)

  const contentKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH))
  const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    contentKey,
    recipientPublicKey,
    { name: 'RSA-OAEP' },
  )

  const metadata: ContainerMetadata = {
    version: 1,
    keyEncryption: {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
      wrappedKey: bytesToBase64(new Uint8Array(wrappedKey)),
    },
    contentEncryption: {
      name: 'AES-GCM',
      length: 256,
      iv: bytesToBase64(iv),
      tagLength: GCM_TAG_LENGTH,
    },
  }
  const safeName = toSafeFileName(file.name)
  const safeMimeType = toSafeMimeType(file.type)
  if (safeName !== 'fichier-restaure') {
    metadata.originalFileName = safeName
  }
  if (safeMimeType !== 'application/octet-stream') {
    metadata.originalMimeType = safeMimeType
  }

  const metadataBytes = encodeUtf8(JSON.stringify(metadata))
  if (metadataBytes.length === 0 || metadataBytes.length > MAX_METADATA_LENGTH) {
    throw new CryptoInputError('Les métadonnées du fichier dépassent la limite autorisée.')
  }

  const prefix = new Uint8Array(FIXED_HEADER_LENGTH)
  prefix.set(MAGIC, 0)
  new DataView(prefix.buffer).setUint32(8, metadataBytes.length, false)
  const authenticatedHeader = concatenateBytes(prefix, metadataBytes)

  const plaintext = new Uint8Array(await file.arrayBuffer())
  let ciphertext: ArrayBuffer
  try {
    ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: authenticatedHeader,
        tagLength: GCM_TAG_LENGTH,
      },
      contentKey,
      plaintext,
    )
  } finally {
    plaintext.fill(0)
  }

  return new Blob([authenticatedHeader, new Uint8Array(ciphertext)], {
    type: 'application/octet-stream',
  })
}

export async function decryptContainer(
  file: File,
  recipientPrivateKey: CryptoKey,
): Promise<RestoredFile> {
  if (file.size < FIXED_HEADER_LENGTH + 1 + GCM_TAG_BYTES || file.size > MAX_PACKAGE_SIZE) {
    throw new CryptoInputError('Le paquet chiffré est vide, incomplet ou trop volumineux.')
  }
  assertRsaPrivateKey(recipientPrivateKey)

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!hasValidMagic(bytes)) {
    throw new CryptoInputError('Ce fichier n’est pas un paquet RSAENC reconnu.')
  }

  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(8, false)
  if (metadataLength === 0 || metadataLength > MAX_METADATA_LENGTH) {
    throw new CryptoInputError('La taille des métadonnées du paquet est invalide.')
  }

  const headerEnd = FIXED_HEADER_LENGTH + metadataLength
  if (headerEnd + GCM_TAG_BYTES > bytes.length) {
    throw new CryptoInputError('Le paquet chiffré est tronqué.')
  }

  const metadataBytes = bytes.subarray(FIXED_HEADER_LENGTH, headerEnd)
  const metadata = parseMetadata(decodeUtf8(metadataBytes))
  const authenticatedHeader = bytes.subarray(0, headerEnd)
  const ciphertext = bytes.subarray(headerEnd)
  assertEncryptedPayloadSize(ciphertext.length)
  const wrappedKey = base64ToBytes(metadata.keyEncryption.wrappedKey, 1024)
  const iv = base64ToBytes(metadata.contentEncryption.iv, GCM_IV_LENGTH)
  if (iv.length !== GCM_IV_LENGTH) {
    throw new CryptoInputError('Les paramètres de chiffrement du paquet sont invalides.')
  }

  let plaintext: ArrayBuffer
  try {
    const contentKey = await crypto.subtle.unwrapKey(
      'raw',
      wrappedKey,
      recipientPrivateKey,
      { name: 'RSA-OAEP' },
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: authenticatedHeader,
        tagLength: GCM_TAG_LENGTH,
      },
      contentKey,
      ciphertext,
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'OperationError') {
      throw new CryptoOperationError(
        'Déchiffrement impossible : vérifiez la clé privée et l’intégrité du paquet.',
      )
    }
    throw error
  }

  return {
    bytes: new Uint8Array(plaintext),
    name: toSafeFileName(metadata.originalFileName),
    mimeType: toSafeMimeType(metadata.originalMimeType),
  }
}

export function encryptedDownloadName(fileName: string): string {
  return `${toSafeFileName(fileName)}.rsaenc`
}

function hasValidMagic(bytes: Uint8Array<ArrayBuffer>): boolean {
  return MAGIC.every((byte, index) => bytes[index] === byte)
}

function parseMetadata(text: string): ContainerMetadata {
  const record = parseRecord(text)
  const allowedKeys = [
    'version',
    'keyEncryption',
    'contentEncryption',
    'originalFileName',
    'originalMimeType',
  ]
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    throw new CryptoInputError('Le paquet contient des métadonnées inconnues.')
  }

  const keyEncryption = getRecord(record.keyEncryption)
  const contentEncryption = getRecord(record.contentEncryption)
  if (
    record.version !== 1 ||
    !hasExactKeys(keyEncryption, ['name', 'hash', 'wrappedKey']) ||
    keyEncryption.name !== 'RSA-OAEP' ||
    keyEncryption.hash !== 'SHA-256' ||
    typeof keyEncryption.wrappedKey !== 'string' ||
    !hasExactKeys(contentEncryption, ['name', 'length', 'iv', 'tagLength']) ||
    contentEncryption.name !== 'AES-GCM' ||
    contentEncryption.length !== 256 ||
    typeof contentEncryption.iv !== 'string' ||
    contentEncryption.tagLength !== GCM_TAG_LENGTH ||
    (record.originalFileName !== undefined &&
      (typeof record.originalFileName !== 'string' || record.originalFileName.length > 512)) ||
    (record.originalMimeType !== undefined &&
      (typeof record.originalMimeType !== 'string' || record.originalMimeType.length > 128))
  ) {
    throw new CryptoInputError('Le format ou les algorithmes du paquet ne sont pas pris en charge.')
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
      tagLength: GCM_TAG_LENGTH,
    },
    ...(typeof record.originalFileName === 'string'
      ? { originalFileName: record.originalFileName }
      : {}),
    ...(typeof record.originalMimeType === 'string'
      ? { originalMimeType: record.originalMimeType }
      : {}),
  }
}

function parseRecord(text: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CryptoInputError('Les métadonnées du paquet sont mal formées.')
    }
    throw error
  }
  return getRecord(value)
}

function getRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new CryptoInputError('Les métadonnées du paquet sont mal formées.')
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
