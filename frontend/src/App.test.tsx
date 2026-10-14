import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('application navigation', () => {
  it('lets the user open the encryption workflow without the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Network unavailable')),
    )
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: /vos fichiers/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Chiffrer' }))

    expect(
      screen.getByRole('heading', { name: 'Protéger un fichier' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText('Service indisponible')).toBeInTheDocument(),
    )
  })

  it('shows the backend availability from the health response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'UP' }),
      }),
    )
    render(<App />)

    await waitFor(() =>
      expect(screen.getByText('Service disponible')).toBeInTheDocument(),
    )
  })
})
