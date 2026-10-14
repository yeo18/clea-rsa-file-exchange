import { CryptoInputError, CryptoOperationError } from '../crypto/errors'

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} octet${bytes === 1 ? '' : 's'}`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof CryptoInputError || error instanceof CryptoOperationError) {
    return error.message
  }
  if (error instanceof DOMException && error.name === 'NotSupportedError') {
    return 'Votre navigateur ne prend pas en charge ces paramètres cryptographiques.'
  }
  return 'Une erreur est survenue. Vérifiez les fichiers et réessayez dans un navigateur compatible.'
}
