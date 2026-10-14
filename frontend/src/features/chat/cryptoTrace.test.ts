import { afterEach, describe, expect, it, vi } from 'vitest'
import { logCryptoTrace } from './cryptoTrace'
import type { MessageEnvelope } from '../../crypto/messageEnvelope'

const envelope: MessageEnvelope = {
  version: 1,
  keyEncryption: {
    name: 'RSA-OAEP',
    hash: 'SHA-256',
    wrappedKey: btoa(String.fromCharCode(...new Uint8Array(384))),
  },
  contentEncryption: {
    name: 'AES-GCM',
    length: 256,
    iv: btoa(String.fromCharCode(...new Uint8Array(12))),
    tagLength: 128,
  },
  ciphertext: btoa(String.fromCharCode(...new Uint8Array(64))),
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('cryptographic demo trace', () => {
  it('does not log when the user has not explicitly enabled it', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    logCryptoTrace(envelope, false)

    expect(info).not.toHaveBeenCalled()
  })

  it('shows algorithms and short encoded excerpts without message plaintext', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    logCryptoTrace(envelope, true)

    if (import.meta.env.DEV) {
      expect(info).toHaveBeenCalledOnce()
      const output = JSON.stringify(info.mock.calls)
      expect(output).toContain('RSA-OAEP / SHA-256')
      expect(output).toContain('AES-256-GCM')
      expect(output).not.toContain('message body')
    }
  })

  it('never logs from a production build', () => {
    vi.stubEnv('DEV', false)
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    logCryptoTrace(envelope, true)

    expect(info).not.toHaveBeenCalled()
  })
})
