import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Radio, Search, Send, ShieldCheck, Upload } from 'lucide-react'
import { CryptoOperationError } from '../../crypto/errors'
import {
  decryptMessage,
  encryptMessage,
  MAX_MESSAGE_BYTES,
} from '../../crypto/messageEnvelope'
import {
  getPublicKeyFingerprint,
  importProtectedPrivateKey,
  importPublicKeyPemText,
} from '../../crypto/keyFiles'
import type { RecipientKeys } from '../../crypto/keyFiles'
import {
  findRecipient,
  getCsrfToken,
  type AccountSession,
  type Recipient,
} from '../../services/authApi'
import { MessageSocket, type DeliveryReceipt, type IncomingMessage } from '../../services/messageSocket'
import { isCryptoTraceAvailable, logCryptoTrace } from './cryptoTrace'

type ChatViewProps = {
  account: AccountSession
  keys: RecipientKeys | null
}

type RecipientWithKey = Recipient & {
  publicKey: CryptoKey
  fingerprint: string
}

type ChatEntry = {
  id: string
  sender: string
  text: string
  status: 'received' | 'sent'
}

type PendingMessage = {
  text: string
  recipient: string
}

export function ChatView({ account, keys }: ChatViewProps) {
  const [socketReady, setSocketReady] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipient, setRecipient] = useState<RecipientWithKey | null>(null)
  const [messageText, setMessageText] = useState('')
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [demoEnabled, setDemoEnabled] = useState(false)
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null)
  const [privateKeyPassphrase, setPrivateKeyPassphrase] = useState('')
  const [importedPrivateKey, setImportedPrivateKey] = useState<CryptoKey | null>(null)
  const [privateKeyStatus, setPrivateKeyStatus] = useState('')
  const socketRef = useRef<MessageSocket | null>(null)
  const pendingMessages = useRef(new Map<string, PendingMessage>())
  const privateKeyRef = useRef<CryptoKey | null>(null)

  const handleIncoming = useCallback(async (incoming: IncomingMessage) => {
    const privateKey = privateKeyRef.current
    if (!privateKey) {
      setError('Importez votre fichier .rsakey protégé dans cette page pour lire ce message.')
      return
    }
    try {
      const text = await decryptMessage(incoming.envelope, privateKey)
      setMessages((current) => [
        ...current,
        { id: incoming.messageId, sender: incoming.senderEmail, text, status: 'received' },
      ])
      setError('')
    } catch (cause) {
      setError(cause instanceof CryptoOperationError
        ? 'Le message est altéré ou ne correspond pas à cette clé privée.'
        : 'Le format du message reçu est invalide.')
    }
  }, [])

  const handleReceipt = useCallback((receipt: DeliveryReceipt) => {
    const pending = pendingMessages.current.get(receipt.messageId)
    if (!pending) return
    pendingMessages.current.delete(receipt.messageId)
    if (!receipt.delivered) {
      setError('Le destinataire est absent ou indisponible. Le message n’a pas été conservé.')
      return
    }
    setMessages((current) => [
      ...current,
      { id: receipt.messageId, sender: 'Vous', text: pending.text, status: 'sent' },
    ])
    setNotice(`Message relayé à ${pending.recipient}.`)
    setError('')
  }, [])

  useEffect(() => {
    privateKeyRef.current = keys?.privateKey ?? importedPrivateKey
  }, [importedPrivateKey, keys])

  useEffect(() => {
    let active = true
    let socket: MessageSocket | null = null
    const pending = pendingMessages.current

    void getCsrfToken()
      .then((csrfToken) => {
        if (!active) return
        socket = new MessageSocket({
          onConnected: () => {
            if (active) {
              setSocketReady(true)
              setError('')
            }
          },
          onDisconnected: () => {
            if (active) {
              setSocketReady(false)
              if (pendingMessages.current.size > 0) {
                pendingMessages.current.clear()
                setError('La connexion a été interrompue. Les messages non confirmés ne seront pas renvoyés.')
              }
            }
          },
          onIncoming: (incoming) => {
            if (active) void handleIncoming(incoming)
          },
          onReceipt: (receipt) => {
            if (active) handleReceipt(receipt)
          },
          onError: () => {
            if (active) setError('La messagerie en direct est momentanément indisponible.')
          },
        })
        socketRef.current = socket
        socket.connect(csrfToken)
      })
      .catch(() => {
        if (active) setError('Impossible d’ouvrir la session de messagerie. Reconnectez-vous.')
      })

    return () => {
      active = false
      pending.clear()
      if (socket) {
        clearSocketRef(socketRef, socket)
        void socket.disconnect()
      }
    }
  }, [account.id, handleIncoming, handleReceipt])

  const handleFindRecipient = async () => {
    setLookupBusy(true)
    setError('')
    setNotice('')
    setRecipient(null)
    try {
      const contact = await findRecipient(recipientEmail.trim())
      const publicKey = await importPublicKeyPemText(contact.publicKeyPem)
      const fingerprint = await getPublicKeyFingerprint(publicKey)
      setRecipient({ ...contact, publicKey, fingerprint })
      setNotice(contact.online
        ? 'Destinataire connecté. Vérifiez son empreinte avant le premier envoi.'
        : 'Destinataire hors ligne. Le message ne pourra pas être mis en attente.')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setLookupBusy(false)
    }
  }

  const handleImportPrivateKey = async () => {
    if (!privateKeyFile) {
      setError('Choisissez votre fichier de clé privée .rsakey.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const imported = await importProtectedPrivateKey(privateKeyFile, privateKeyPassphrase)
      setImportedPrivateKey(imported)
      setPrivateKeyPassphrase('')
      setPrivateKeyStatus('Clé privée chargée uniquement dans cette session de navigateur.')
    } catch {
      setError('Impossible de déverrouiller ce fichier .rsakey. Vérifiez le fichier et son mot de passe.')
      setPrivateKeyPassphrase('')
    } finally {
      setBusy(false)
    }
  }

  const handleSend = async () => {
    const socket = socketRef.current
    const text = messageText.trim()
    if (!socketReady || !socket || !recipient || !recipient.online) {
      setError('Recherchez un destinataire connecté avant l’envoi.')
      return
    }
    if (text.length === 0) {
      setError('Saisissez un message avant de l’envoyer.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      const envelope = await encryptMessage(text, recipient.publicKey)
      logCryptoTrace(envelope, demoEnabled)
      const messageId = crypto.randomUUID()
      pendingMessages.current.set(messageId, { text, recipient: recipient.email })
      socket.publish(messageId, recipient.id, envelope)
      setMessageText('')
      setNotice('Message chiffré et envoyé au relais. En attente de confirmation.')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const activePrivateKey = keys?.privateKey ?? importedPrivateKey

  return (
    <section className="view-stack" aria-labelledby="chat-heading">
      <div className="view-heading">
        <div>
          <p className="eyebrow"><MessageCircle size={14} />Messagerie confidentielle</p>
          <h1 id="chat-heading">Écrire à votre binôme</h1>
          <p className="view-intro">
            Connecté en tant que {account.email}. Le texte est chiffré dans votre navigateur avant le relais.
          </p>
        </div>
        <span className={`status-pill${socketReady ? ' status-pill--good' : ''}`}>
          <Radio size={14} />{socketReady ? 'En ligne' : 'Connexion…'}
        </span>
      </div>

      <div className="card">
        <div className="card-heading">
          <span className="icon-tile icon-tile--indigo"><Search size={18} /></span>
          <div>
            <h2>Destinataire</h2>
            <p>Recherchez l’adresse e-mail vérifiée de votre binôme.</p>
          </div>
        </div>
        <div className="recipient-search">
          <label className="field">
            <span>Adresse e-mail du destinataire</span>
            <input
              autoComplete="email"
              maxLength={320}
              onChange={(event) => setRecipientEmail(event.currentTarget.value)}
              type="email"
              value={recipientEmail}
            />
          </label>
          <button
            className="button button--secondary"
            disabled={lookupBusy || recipientEmail.trim().length === 0}
            onClick={() => void handleFindRecipient()}
            type="button"
          >
            <Search size={16} />{lookupBusy ? 'Recherche…' : 'Rechercher'}
          </button>
        </div>
        {recipient && (
          <div className="recipient-card" role="status">
            <div>
              <strong>{recipient.email}</strong>
              <span>{recipient.online ? 'Connecté maintenant' : 'Hors ligne'}</span>
            </div>
            <p>Empreinte SHA-256 : <code>{recipient.fingerprint}</code></p>
            <small>Comparez cette empreinte avec votre binôme par un canal séparé.</small>
          </div>
        )}
      </div>

      {!activePrivateKey && (
        <div className="card">
          <div className="card-heading">
            <span className="icon-tile icon-tile--amber"><ShieldCheck size={18} /></span>
            <div>
              <h2>Charger votre clé privée</h2>
              <p>Elle reste dans cette page et n’est jamais envoyée au serveur.</p>
            </div>
          </div>
          <label className="field">
            <span>Fichier .rsakey</span>
            <input
              accept=".rsakey,application/json"
              onChange={(event) => setPrivateKeyFile(event.currentTarget.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <label className="field">
            <span>Mot de passe du fichier</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPrivateKeyPassphrase(event.currentTarget.value)}
              type="password"
              value={privateKeyPassphrase}
            />
          </label>
          <button className="button button--secondary" disabled={busy} onClick={() => void handleImportPrivateKey()} type="button">
            <Upload size={16} />{busy ? 'Déverrouillage…' : 'Charger la clé privée'}
          </button>
          {privateKeyStatus && <p className="security-note" role="status">{privateKeyStatus}</p>}
        </div>
      )}

      <div className="card chat-card">
        <div className="card-heading">
          <span className="icon-tile icon-tile--green"><MessageCircle size={18} /></span>
          <div>
            <h2>Conversation</h2>
            <p>Les messages ne sont pas conservés après fermeture ou déconnexion.</p>
          </div>
        </div>
        <div className="chat-log" aria-label="Messages reçus et envoyés" aria-live="polite" role="log">
          {messages.length === 0
            ? <p className="chat-empty">Aucun message dans cette session.</p>
            : messages.map((message) => (
              <article className={`chat-message chat-message--${message.status}`} key={message.id}>
                <strong>{message.sender}</strong>
                <p>{message.text}</p>
              </article>
            ))}
        </div>
        <label className="field">
          <span>Votre message (8 Kio maximum)</span>
          <textarea
            maxLength={MAX_MESSAGE_BYTES}
            onChange={(event) => setMessageText(event.currentTarget.value)}
            rows={4}
            value={messageText}
          />
        </label>
        <button
          className="button button--primary"
          disabled={busy || !socketReady || !recipient?.online || !messageText.trim()}
          onClick={() => void handleSend()}
          type="button"
        >
          <Send size={16} />{busy ? 'Chiffrement…' : 'Chiffrer et envoyer'}
        </button>
      </div>

      {isCryptoTraceAvailable() && (
        <label className="demo-toggle">
          <input
            checked={demoEnabled}
            onChange={(event) => setDemoEnabled(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>Afficher la trace cryptographique dans la console (développement seulement)</span>
        </label>
      )}

      {notice && <p className="feedback feedback--success" role="status">{notice}</p>}
      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      <p className="security-note">
        RSA-OAEP chiffre uniquement la clé AES temporaire; AES-GCM chiffre le message et détecte les altérations.
        Ce mécanisme ne signe pas le message et ne prouve pas cryptographiquement l’identité de l’expéditeur.
      </p>
    </section>
  )
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Une erreur inattendue empêche cette opération.'
}

function clearSocketRef(
  socketRef: { current: MessageSocket | null },
  socket: MessageSocket,
): void {
  if (socketRef.current === socket) socketRef.current = null
}
