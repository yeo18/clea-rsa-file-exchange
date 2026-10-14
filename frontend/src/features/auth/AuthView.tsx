import { useState, type FormEvent } from 'react'
import { LogIn, LogOut, MailCheck, UserRoundPlus } from 'lucide-react'
import { ApiError, loginAccount, logoutAccount, registerAccount, resendVerification } from '../../services/authApi'
import type { AccountSession } from '../../services/authApi'

type AuthViewProps = {
  account: AccountSession | null
  notice: string
  onAuthenticated: (account: AccountSession) => void
  onLoggedOut: () => void
  onOpenMessages: () => void
}

export function AuthView({
  account,
  notice,
  onAuthenticated,
  onLoggedOut,
  onOpenMessages,
}: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')
    try {
      if (mode === 'register') {
        setMessage(await registerAccount(email, password))
      } else {
        onAuthenticated(await loginAccount(email, password))
        setMessage('Connexion réussie.')
      }
      setPassword('')
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      setMessage(await resendVerification(email))
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    setBusy(true)
    setError('')
    try {
      await logoutAccount()
      onLoggedOut()
      setMessage('Vous êtes déconnecté.')
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="view-stack" aria-labelledby="account-heading">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Compte Cléa</p>
          <h1 id="account-heading">{account ? 'Votre compte' : 'Se connecter à Cléa'}</h1>
          <p className="view-intro">
            Une adresse vérifiée est nécessaire pour envoyer et recevoir des messages en direct.
          </p>
        </div>
      </div>

      {notice && <p className="feedback feedback--success" role="status">{notice}</p>}

      {account ? (
        <div className="card account-card">
          <div className="card-heading">
            <span className="icon-tile icon-tile--green"><MailCheck size={20} /></span>
            <div>
              <h2>Adresse vérifiée</h2>
              <p>{account.email}</p>
            </div>
          </div>
          <p className="muted-copy">
            {account.hasPublicKey
              ? 'Votre clé publique est enregistrée pour permettre à vos contacts de vous écrire.'
              : 'Enregistrez votre clé publique dans « Mes clés » pour recevoir des messages.'}
          </p>
          <div className="account-actions">
            <button className="button button--primary" onClick={onOpenMessages} type="button">
              Ouvrir les messages
            </button>
            <button className="button button--secondary" disabled={busy} onClick={handleLogout} type="button">
              <LogOut size={16} />Se déconnecter
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="auth-tabs" role="tablist" aria-label="Action de compte">
            <button
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'auth-tab auth-tab--active' : 'auth-tab'}
              onClick={() => {
                setMode('login')
                setMessage('')
                setError('')
              }}
              role="tab"
              type="button"
            >
              <LogIn size={15} />Connexion
            </button>
            <button
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'auth-tab auth-tab--active' : 'auth-tab'}
              onClick={() => {
                setMode('register')
                setMessage('')
                setError('')
              }}
              role="tab"
              type="button"
            >
              <UserRoundPlus size={15} />Créer un compte
            </button>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Adresse e-mail</span>
              <input
                autoComplete="email"
                maxLength={320}
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="field">
              <span>Mot de passe</span>
              <input
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                maxLength={128}
                minLength={mode === 'register' ? 12 : 1}
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
                type="password"
                value={password}
              />
              {mode === 'register' && <small>12 caractères minimum.</small>}
            </label>
            <button className="button button--primary" disabled={busy} type="submit">
              {mode === 'register' ? <UserRoundPlus size={16} /> : <LogIn size={16} />}
              {busy ? 'Veuillez patienter…' : mode === 'register' ? 'Créer mon compte' : 'Se connecter'}
            </button>
          </form>

          {mode === 'register' && email && (
            <div className="resend-row">
              <span>Vous n’avez pas reçu le lien de vérification ?</span>
              <button className="text-button" disabled={busy} onClick={handleResend} type="button">
                Renvoyer le lien
              </button>
            </div>
          )}
        </div>
      )}

      {message && <p className="feedback feedback--success" role="status">{message}</p>}
      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      <p className="security-note">
        Les mots de passe servent uniquement à ouvrir une session. Ils ne protègent pas et ne remplacent pas votre clé privée.
      </p>
    </section>
  )
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Le service est indisponible. Vérifiez que le serveur est démarré et réessayez.'
}
