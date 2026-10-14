export type HealthStatus = 'checking' | 'online' | 'offline'

export async function checkBackendHealth(): Promise<boolean> {
  const response = await fetch('/api/health', { headers: { Accept: 'application/json' } })
  if (!response.ok) return false

  const payload: unknown = await response.json()
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'status' in payload &&
    payload.status === 'UP'
  )
}
