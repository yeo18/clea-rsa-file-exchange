import { CryptoInputError } from './errors'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })

export function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(value)
}

export function decodeUtf8(value: Uint8Array<ArrayBuffer>): string {
  try {
    return textDecoder.decode(value)
  } catch {
    throw new CryptoInputError('Le fichier contient du texte de métadonnées invalide.')
  }
}

export function bytesToBase64(value: Uint8Array<ArrayBuffer>): string {
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < value.length; offset += chunkSize) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

export function base64ToBytes(value: string, maxBytes: number): Uint8Array<ArrayBuffer> {
  if (
    value.length === 0 ||
    value.length > Math.ceil(maxBytes / 3) * 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new CryptoInputError('Le fichier contient des données encodées invalides.')
  }

  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new CryptoInputError('Le fichier contient des données encodées invalides.')
  }

  if (binary.length > maxBytes) {
    throw new CryptoInputError('Le fichier dépasse la taille maximale autorisée.')
  }

  const output = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index)
  }
  return output
}

export function concatenateBytes(
  ...parts: readonly Uint8Array<ArrayBuffer>[]
): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0

  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

export function toSafeFileName(value: string | undefined): string {
  const name = (value ?? '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127 ? '_' : character
    })
    .join('')
    .replace(/^\.+$/, '')
    .trim()
    .slice(0, 180)

  return name || 'fichier-restaure'
}

export function toSafeMimeType(value: string | undefined): string {
  if (!value || value.length > 128 || !/^[\w.+-]+\/[\w.+-]+$/.test(value)) {
    return 'application/octet-stream'
  }
  return value
}
