export function hasSecureCryptoContext(): boolean {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return false
  return (
    window.isSecureContext ||
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  )
}
