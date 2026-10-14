export class CryptoInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoInputError'
  }
}

export class CryptoOperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoOperationError'
  }
}
