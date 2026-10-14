import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Fingerprint,
  CloudUpload,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  exportProtectedPrivateKey,
  exportPublicKeyPem,
  generateRecipientKeys,
  getPublicKeyFingerprint,
  type RecipientKeys,
} from '../../crypto/keyFiles'
import { downloadBlob } from '../../utils/download'
import { getSafeErrorMessage } from '../../utils/format'
import { hasSecureCryptoContext } from '../../utils/secureContext'
import { savePublicKey } from '../../services/authApi'

type KeyManagerProps = {
  keys: RecipientKeys | null
  onKeysGenerated: (keys: RecipientKeys) => void
  isAuthenticated: boolean
}

export function KeyManager({ keys, onKeysGenerated, isAuthenticated }: KeyManagerProps) {
  const [busy, setBusy] = useState<'generate' | 'protect' | 'register' | null>(null)
  const [fingerprint, setFingerprint] = useState('')
  const [registeredFingerprint, setRegisteredFingerprint] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!keys) return
    let active = true
    void getPublicKeyFingerprint(keys.publicKey)
      .then((value) => {
        if (active) setFingerprint(value)
      })
      .catch((cause: unknown) => {
        if (active) setError(getSafeErrorMessage(cause))
      })
    return () => {
      active = false
    }
  }, [keys])

  const handleGenerate = async () => {
    if (!hasSecureCryptoContext()) {
      setError('La cryptographie exige HTTPS ou localhost dans un navigateur compatible.')
      return
    }
    setBusy('generate')
    setError('')
    setMessage('Génération de la paire RSA en cours…')
    try {
      const generated = await generateRecipientKeys()
      const generatedFingerprint = await getPublicKeyFingerprint(generated.publicKey)
      onKeysGenerated(generated)
      setFingerprint(generatedFingerprint)
      setMessage('La paire de clés est prête pour cette session.')
      setPassphrase('')
      setConfirmation('')
    } catch (cause) {
      setMessage('')
      setError(getSafeErrorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const handleExportPublicKey = async () => {
    if (!keys) return
    setError('')
    try {
      const pem = await exportPublicKeyPem(keys.publicKey)
      downloadBlob(pem, 'cle-publique.pem')
      setMessage('Clé publique téléchargée. Vérifiez son empreinte avec votre binôme.')
    } catch (cause) {
      setError(getSafeErrorMessage(cause))
    }
  }

  const handleExportPrivateKey = async () => {
    if (!keys) return
    setError('')
    if (passphrase !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.')
      setPassphrase('')
      setConfirmation('')
      return
    }
    setBusy('protect')
    try {
      const protectedKey = await exportProtectedPrivateKey(keys.privateKey, passphrase)
      downloadBlob(protectedKey, 'cle-privee.rsakey')
      setMessage('Clé privée téléchargée et protégée. Conservez le fichier et son mot de passe séparément.')
      setPassphrase('')
      setConfirmation('')
    } catch (cause) {
      setError(getSafeErrorMessage(cause))
    } finally {
      setPassphrase('')
      setConfirmation('')
      setBusy(null)
    }
  }

  const handleRegisterPublicKey = async () => {
    if (!keys) return
    setBusy('register')
    setError('')
    try {
      const publicKeyFile = await exportPublicKeyPem(keys.publicKey)
      await savePublicKey(await publicKeyFile.text())
      setRegisteredFingerprint(fingerprint)
      setMessage('Clé publique enregistrée pour recevoir des messages.')
    } catch (cause) {
      setError(getSafeErrorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const handleCopyFingerprint = async () => {
    if (!fingerprint) return
    try {
      await navigator.clipboard.writeText(fingerprint)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('La copie automatique a échoué. Vous pouvez sélectionner l’empreinte manuellement.')
    }
  }

  return (
    <section className="view-stack" aria-labelledby="keys-heading">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Gestion des clés</p>
          <h1 id="keys-heading">Votre identité cryptographique</h1>
          <p className="view-intro">
            Créez une paire de clés dans ce navigateur. Seule la clé publique se partage.
          </p>
        </div>
        <span className={`status-pill${keys ? ' status-pill--good' : ''}`}>
          {keys ? <Check size={15} /> : <LockKeyhole size={15} />}
          {keys ? 'Paire en mémoire' : 'Aucune paire active'}
        </span>
      </div>

      <div className="card key-generation-card">
        <div className="card-heading">
          <span className="icon-tile icon-tile--indigo"><KeyRound size={20} /></span>
          <div>
            <h2>Générer une paire RSA</h2>
            <p>RSA-OAEP · 3072 bits · SHA-256</p>
          </div>
        </div>
        <p className="muted-copy">
          La génération s’effectue localement et peut prendre quelques secondes. Les clés ne sont pas enregistrées sur le serveur.
        </p>
        <button className="button button--primary" disabled={busy !== null} onClick={handleGenerate} type="button">
          {busy === 'generate' ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}
          {busy === 'generate' ? 'Génération…' : keys ? 'Générer une nouvelle paire' : 'Générer ma paire'}
        </button>
      </div>

      {keys && (
        <>
          <div className="card">
            <div className="card-heading">
              <span className="icon-tile icon-tile--green"><Fingerprint size={20} /></span>
              <div>
                <h2>Clé publique</h2>
                <p>SPKI PEM · partageable après vérification</p>
              </div>
            </div>
            <div className="fingerprint-panel">
              <span className="fingerprint-label">Empreinte SHA-256</span>
              <code>{fingerprint || 'Calcul…'}</code>
              <button className="button button--secondary button--compact" onClick={handleCopyFingerprint} type="button">
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copiée' : 'Copier'}
              </button>
            </div>
            <p className="security-note">
              Comparez cette empreinte avec votre binôme par un canal séparé avant tout chiffrement.
            </p>
            <button className="button button--secondary" disabled={busy !== null} onClick={handleExportPublicKey} type="button">
              <Download size={17} />
              Télécharger la clé publique
            </button>
            {isAuthenticated ? (
              <button
                className="button button--secondary"
                disabled={busy !== null || !fingerprint}
                onClick={() => void handleRegisterPublicKey()}
                type="button"
              >
                <CloudUpload size={17} />
                {registeredFingerprint === fingerprint ? 'Clé enregistrée' : 'Enregistrer pour la messagerie'}
              </button>
            ) : (
              <p className="security-note">Connectez-vous pour enregistrer cette clé publique avec votre compte.</p>
            )}
          </div>

          <div className="card">
            <div className="card-heading">
              <span className="icon-tile icon-tile--amber"><ShieldCheck size={20} /></span>
              <div>
                <h2>Clé privée protégée</h2>
                <p>PKCS#8 chiffré · format applicatif .rsakey</p>
              </div>
            </div>
            <p className="muted-copy">
              Choisissez un mot de passe robuste d’au moins 12 caractères. Il protège le fichier avec AES-GCM; ne le perdez pas.
            </p>
            <div className="form-grid form-grid--two">
              <label className="field">
                <span>Mot de passe</span>
                <input
                  autoComplete="new-password"
                  disabled={busy !== null}
                  minLength={12}
                  onChange={(event) => setPassphrase(event.currentTarget.value)}
                  required
                  type="password"
                  value={passphrase}
                />
              </label>
              <label className="field">
                <span>Confirmer le mot de passe</span>
                <input
                  autoComplete="new-password"
                  disabled={busy !== null}
                  minLength={12}
                  onChange={(event) => setConfirmation(event.currentTarget.value)}
                  required
                  type="password"
                  value={confirmation}
                />
              </label>
            </div>
            <button
              className="button button--primary"
              disabled={busy !== null || passphrase.length === 0 || confirmation.length === 0}
              onClick={handleExportPrivateKey}
              type="button"
            >
              {busy === 'protect' ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}
              Télécharger la clé privée protégée
            </button>
            <div className="warning-note">
              <AlertTriangle size={17} />
              <p>Conservez une copie de ce fichier et son mot de passe. Sans l’un des deux, la clé ne pourra pas être restaurée.</p>
            </div>
          </div>
        </>
      )}

      {message && <p className="feedback feedback--success" role="status">{message}</p>}
      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
    </section>
  )
}
