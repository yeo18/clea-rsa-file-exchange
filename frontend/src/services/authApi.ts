export type AccountSession = {
  id: string
  email: string
  hasPublicKey: boolean
}

export type Recipient = {
  id: string
  email: string
  publicKeyPem: string
  online: boolean
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export async function loadSession(): Promise<AccountSession | null> {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin' })
  if (response.status === 401) return null
  if (!response.ok) throw apiError(response.status)
  return parseAccountSession(await response.json())
}

export async function registerAccount(email: string, password: string): Promise<string> {
  const response = await postJson('/api/auth/register', { email, password })
  const result = await readMessage(response)
  return result
}

export async function resendVerification(email: string): Promise<string> {
  const response = await postJson('/api/auth/resend-verification', { email })
  return readMessage(response)
}

export async function verifyEmail(token: string): Promise<AccountSession> {
  const response = await postJson('/api/auth/verify', { token })
  return parseAccountSession(await response.json())
}

export async function loginAccount(email: string, password: string): Promise<AccountSession> {
  const response = await postJson('/api/auth/login', { email, password })
  return parseAccountSession(await response.json())
}

export async function logoutAccount(): Promise<void> {
  const response = await postJson('/api/auth/logout')
  if (response.status !== 204) throw apiError(response.status)
}

export async function savePublicKey(publicKeyPem: string): Promise<void> {
  const response = await putJson('/api/account/public-key', { publicKeyPem })
  if (response.status !== 204) throw apiError(response.status)
}

export async function findRecipient(email: string): Promise<Recipient> {
  const response = await fetch(`/api/contacts?email=${encodeURIComponent(email)}`, {
    credentials: 'same-origin',
  })
  if (!response.ok) throw apiError(response.status)
  return parseRecipient(await response.json())
}

export async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  if (!response.ok) throw apiError(response.status)
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.token !== 'string' || body.token.length === 0) {
    throw new Error('La protection de session est indisponible.')
  }
  return body.token
}

async function postJson(path: string, body?: unknown): Promise<Response> {
  return sendJson(path, 'POST', body)
}

async function putJson(path: string, body: unknown): Promise<Response> {
  return sendJson(path, 'PUT', body)
}

async function sendJson(path: string, method: 'POST' | 'PUT', body?: unknown): Promise<Response> {
  const csrfToken = await getCsrfToken()
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw apiError(response.status)
  return response
}

async function readMessage(response: Response): Promise<string> {
  const body: unknown = await response.json()
  if (isRecord(body) && typeof body.message === 'string') return body.message
  throw new Error('La réponse du serveur est invalide.')
}

function parseAccountSession(value: unknown): AccountSession {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.email !== 'string'
    || typeof value.hasPublicKey !== 'boolean'
  ) {
    throw new Error('La réponse de session est invalide.')
  }
  return { id: value.id, email: value.email, hasPublicKey: value.hasPublicKey }
}

function parseRecipient(value: unknown): Recipient {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.email !== 'string'
    || typeof value.publicKeyPem !== 'string'
    || typeof value.online !== 'boolean'
  ) {
    throw new Error('La réponse du destinataire est invalide.')
  }
  return {
    id: value.id,
    email: value.email,
    publicKeyPem: value.publicKeyPem,
    online: value.online,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function apiError(status: number): ApiError {
  if (status === 400) return new ApiError(status, 'Les informations saisies sont invalides.')
  if (status === 401) return new ApiError(status, 'Identifiants invalides ou adresse non vérifiée.')
  if (status === 403) return new ApiError(status, 'Votre session a expiré. Reconnectez-vous.')
  if (status === 404) return new ApiError(status, 'Aucun destinataire vérifié avec une clé publique n’a été trouvé.')
  if (status === 429) return new ApiError(status, 'Trop de demandes. Réessayez plus tard.')
  if (status === 503) return new ApiError(status, 'Le service e-mail est temporairement indisponible.')
  return new ApiError(status, 'Le service est temporairement indisponible.')
}
