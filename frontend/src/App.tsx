import {
  ArrowRight,
  FileLock2,
  FileQuestion,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  UnlockKeyhole,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecipientKeys } from './crypto/keyFiles'
import { AuthView } from './features/auth/AuthView'
import { ChatView } from './features/chat/ChatView'
import { DecryptView } from './features/decrypt/DecryptView'
import { EncryptView } from './features/encrypt/EncryptView'
import { KeyManager } from './features/keys/KeyManager'
import { loadSession, verifyEmail, type AccountSession } from './services/authApi'
import { checkBackendHealth, type HealthStatus } from './services/health'
import './App.css'

type View = 'home' | 'keys' | 'encrypt' | 'decrypt' | 'messages' | 'account'

const navigation: { id: View; label: string }[] = [
  { id: 'home', label: 'Accueil' },
  { id: 'keys', label: 'Mes clés' },
  { id: 'encrypt', label: 'Chiffrer' },
  { id: 'decrypt', label: 'Déchiffrer' },
  { id: 'messages', label: 'Messages' },
  { id: 'account', label: 'Compte' },
]

function App() {
  const [view, setView] = useState<View>('home')
  const [keys, setKeys] = useState<RecipientKeys | null>(null)
  const [health, setHealth] = useState<HealthStatus>('checking')
  const [account, setAccount] = useState<AccountSession | null>(null)
  const [authNotice, setAuthNotice] = useState('')
  const processedVerification = useRef<string | null>(null)

  const refreshHealth = useCallback(async () => {
    try {
      setHealth((await checkBackendHealth()) ? 'online' : 'offline')
    } catch {
      setHealth('offline')
    }
  }, [])

  useEffect(() => {
    // This effect starts a health request; its result updates state asynchronously.
    // eslint-disable-next-line react/set-state-in-effect
    void refreshHealth()
    const interval = window.setInterval(() => void refreshHealth(), 30_000)
    return () => window.clearInterval(interval)
  }, [refreshHealth])

  useEffect(() => {
    if (window.location.hash.startsWith('#verify=')) return
    let active = true
    void loadSession()
      .then((currentAccount) => {
        if (active) setAccount(currentAccount)
      })
      .catch(() => {
        if (active) setAccount(null)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const match = /^#verify=([A-Za-z0-9_-]{43})$/.exec(window.location.hash)
    const token = match?.[1]
    if (!token || processedVerification.current === token) return
    processedVerification.current = token
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    setView('account')
    setAuthNotice('Vérification de votre adresse e-mail…')
    void verifyEmail(token)
      .then((verifiedAccount) => {
        setAccount(verifiedAccount)
        setView('messages')
        setAuthNotice('Adresse vérifiée et session ouverte. Vous pouvez maintenant échanger des messages.')
      })
      .catch(() => {
        setAuthNotice('Ce lien est invalide, expiré ou déjà utilisé. Demandez un nouveau lien de vérification.')
      })
  }, [])

  const handleAuthentication = (authenticatedAccount: AccountSession) => {
    setAccount(authenticatedAccount)
    setAuthNotice('')
  }

  const handleLogout = () => {
    setAccount(null)
    setAuthNotice('')
    setView('account')
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Aller au contenu</a>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setView('home')}
          type="button"
        >
          <span className="brand-mark"><ShieldCheck size={21} /></span>
          <span className="brand-copy">
            <strong>Cléa</strong>
            <small>Échange chiffré</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Navigation principale">
          {navigation.map((item) => (
            <button
              aria-current={view === item.id ? 'page' : undefined}
              className={`nav-link${view === item.id ? ' nav-link--active' : ''}`}
              key={item.id}
              onClick={() => setView(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          aria-label={`État du serveur : ${healthLabel(health)}. Actualiser`}
          className={`health-indicator health-indicator--${health}`}
          onClick={() => {
            setHealth('checking')
            void refreshHealth()
          }}
          title="Actualiser l’état du serveur"
          type="button"
        >
          <span className="health-dot" />
          <span>{healthLabel(health)}</span>
        </button>
      </header>

      <main id="main-content" className="main-content">
        {view === 'home' && <HomeView onNavigate={setView} />}
        {view === 'keys' && (
          <KeyManager
            isAuthenticated={account !== null}
            keys={keys}
            onKeysGenerated={setKeys}
          />
        )}
        {view === 'encrypt' && <EncryptView defaultPublicKey={keys?.publicKey ?? null} />}
        {view === 'decrypt' && <DecryptView defaultPrivateKey={keys?.privateKey ?? null} />}
        {view === 'account' && (
          <AuthView
            account={account}
            notice={authNotice}
            onAuthenticated={handleAuthentication}
            onLoggedOut={handleLogout}
            onOpenMessages={() => setView('messages')}
          />
        )}
        {view === 'messages' && (account
          ? <ChatView account={account} keys={keys} />
          : (
            <section className="view-stack" aria-labelledby="messages-login-heading">
              <div className="card">
                <h2 id="messages-login-heading">Connectez-vous pour ouvrir la messagerie</h2>
                <p className="muted-copy">Les messages sont adressés à un compte vérifié et transmis uniquement en direct.</p>
                <button className="button button--primary" onClick={() => setView('account')} type="button">
                  Ouvrir mon compte
                </button>
              </div>
            </section>
          ))}
      </main>

      <footer className="app-footer">
        <span><LockKeyhole size={14} />Fichiers et clés restent dans votre navigateur; messages déchiffrés localement.</span>
        <span>RSA-OAEP + AES-256-GCM</span>
      </footer>
    </div>
  )
}

function HomeView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <section className="home-view" aria-labelledby="welcome-heading">
      <div className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow"><ShieldCheck size={15} />Confidentialité, simplement</span>
          <h1 id="welcome-heading">Vos fichiers. <span>À l’abri.</span></h1>
          <p className="hero-description">
            Chiffrez vos fichiers ou écrivez à votre binôme. Les messages sont protégés dans votre navigateur avant leur envoi.
          </p>
          <div className="hero-trust">
            <span><LockKeyhole size={16} />Chiffrement local</span>
            <span><FileLock2 size={16} />Aucun fichier envoyé au serveur</span>
          </div>
        </div>
        <div className="hero-symbol" aria-hidden="true">
          <span className="hero-symbol__halo" />
          <span className="hero-symbol__shield"><ShieldCheck size={58} strokeWidth={1.5} /></span>
          <span className="hero-symbol__lock"><LockKeyhole size={21} /></span>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Votre espace de travail</p>
          <h2>Que souhaitez-vous faire ?</h2>
        </div>
        <button className="text-button" onClick={() => onNavigate('keys')} type="button">
          Gérer mes clés <ArrowRight size={15} />
        </button>
      </div>

      <div className="action-grid">
        <button className="action-card action-card--primary" onClick={() => onNavigate('encrypt')} type="button">
          <span className="action-icon"><FileLock2 size={21} /></span>
          <span className="action-card__body">
            <strong>Chiffrer un fichier</strong>
            <span>Protégez un fichier avec la clé publique de votre binôme.</span>
          </span>
          <ArrowRight className="action-arrow" size={19} />
        </button>
        <button className="action-card" onClick={() => onNavigate('decrypt')} type="button">
          <span className="action-icon action-icon--neutral"><UnlockKeyhole size={21} /></span>
          <span className="action-card__body">
            <strong>Déchiffrer un fichier</strong>
            <span>Restaurez un paquet reçu avec votre clé privée.</span>
          </span>
          <ArrowRight className="action-arrow" size={19} />
        </button>
        <button className="action-card" onClick={() => onNavigate('messages')} type="button">
          <span className="action-icon action-icon--neutral"><MessageCircle size={21} /></span>
          <span className="action-card__body">
            <strong>Envoyer un message</strong>
            <span>Échangez en direct avec un compte vérifié, sans boîte de réception.</span>
          </span>
          <ArrowRight className="action-arrow" size={19} />
        </button>
      </div>

      <div className="how-it-works">
        <div className="how-heading">
          <span className="icon-tile icon-tile--indigo"><FileQuestion size={19} /></span>
          <div>
            <h2>Comment ça fonctionne</h2>
            <p>Un échange de fichiers local ou un message chiffré en direct.</p>
          </div>
        </div>
        <ol className="steps-list">
          <li><span>1</span><div><strong>Le destinataire crée ses clés</strong><small>Il partage sa clé publique et garde sa clé privée secrète.</small></div></li>
          <li><span>2</span><div><strong>L’expéditeur chiffre le fichier</strong><small>Le paquet .rsaenc peut être partagé par un canal ordinaire.</small></div></li>
          <li><span>3</span><div><strong>Le destinataire restaure le fichier</strong><small>Seule sa clé privée permet de le déchiffrer.</small></div></li>
        </ol>
      </div>

      <aside className="home-notice">
        <ShieldCheck size={18} />
        <p><strong>La clé publique ne suffit pas à prouver l’identité de l’expéditeur.</strong> Vérifiez toujours l’empreinte de la clé publique avec votre binôme.</p>
      </aside>

      <button className="home-key-link" onClick={() => onNavigate('keys')} type="button">
        <KeyRound size={16} />Créer ou télécharger ma paire de clés
      </button>
    </section>
  )
}

function healthLabel(health: HealthStatus): string {
  if (health === 'online') return 'Service disponible'
  if (health === 'offline') return 'Service indisponible'
  return 'Vérification…'
}

export default App
