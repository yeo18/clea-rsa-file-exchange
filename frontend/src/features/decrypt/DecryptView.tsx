import { AlertCircle, FileKey2, FileLock2, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { FileDropZone } from '../../components/FileDropZone'
import { CryptoInputError } from '../../crypto/errors'
import { decryptContainer } from '../../crypto/fileContainer'
import { importProtectedPrivateKey } from '../../crypto/keyFiles'
import { downloadBlob } from '../../utils/download'
import { formatFileSize, getSafeErrorMessage } from '../../utils/format'
import { hasSecureCryptoContext } from '../../utils/secureContext'

type DecryptViewProps = {
  defaultPrivateKey: CryptoKey | null
}

export function DecryptView({ defaultPrivateKey }: DecryptViewProps) {
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleDecrypt = async () => {
    setError('')
    setMessage('')
    if (!packageFile) {
      setError('Sélectionnez le paquet .rsaenc à déchiffrer.')
      return
    }

    if (!privateKeyFile && !defaultPrivateKey) {
      setError('Importez votre fichier de clé privée protégée .rsakey.')
      return
    }
    if (privateKeyFile && !passphrase) {
      setError('Saisissez le mot de passe de protection de la clé privée.')
      return
    }
    if (!hasSecureCryptoContext()) {
      setError('La cryptographie exige HTTPS ou localhost dans un navigateur compatible.')
      return
    }

    setBusy(true)
    try {
      const privateKey = privateKeyFile
        ? await importProtectedPrivateKey(privateKeyFile, passphrase)
        : defaultPrivateKey
      if (!privateKey) {
        throw new CryptoInputError('La clé privée n’a pas pu être chargée.')
      }
      const restored = await decryptContainer(packageFile, privateKey)
      try {
        downloadBlob(
          new Blob([restored.bytes], { type: restored.mimeType }),
          restored.name,
        )
      } finally {
        restored.bytes.fill(0)
      }
      setMessage('Fichier restauré et téléchargé. Son intégrité a été vérifiée.')
    } catch (cause) {
      setError(getSafeErrorMessage(cause))
    } finally {
      setPassphrase('')
      setBusy(false)
    }
  }

  return (
    <section className="view-stack" aria-labelledby="decrypt-heading">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Déchiffrement</p>
          <h1 id="decrypt-heading">Restaurer un fichier</h1>
          <p className="view-intro">
            Utilisez le paquet reçu et la clé privée du destinataire. Le déchiffrement reste local.
          </p>
        </div>
        <span className="status-pill status-pill--good"><ShieldCheck size={15} />Vérification d’intégrité</span>
      </div>

      <div className="card flow-card">
        <div className="step-heading">
          <span className="step-number">01</span>
          <div>
            <h2>Paquet chiffré</h2>
            <p>Choisissez le fichier .rsaenc reçu par votre binôme.</p>
          </div>
        </div>
        <FileDropZone
          accept=".rsaenc"
          description="Paquet RSAENC versionné — maximum 50 Mio de contenu"
          file={packageFile}
          label="Déposez le paquet .rsaenc ici"
          onFile={(file) => {
            setPackageFile(file)
            setError('')
            setMessage('')
          }}
        />
        {packageFile && (
          <div className="file-summary file-summary--single">
            <span><strong>Nom</strong>{packageFile.name}</span>
            <span><strong>Taille</strong>{formatFileSize(packageFile.size)}</span>
          </div>
        )}
      </div>

      <div className="card flow-card">
        <div className="step-heading">
          <span className="step-number">02</span>
          <div>
            <h2>Clé privée du destinataire</h2>
            <p>Importez le fichier protégé .rsakey et saisissez son mot de passe.</p>
          </div>
        </div>
        <FileDropZone
          accept=".rsakey"
          description="Fichier privé protégé par mot de passe"
          file={privateKeyFile}
          label="Déposez votre clé privée ici"
          onFile={(file) => {
            setPrivateKeyFile(file)
            setPassphrase('')
            setError('')
            setMessage('')
          }}
        />
        {privateKeyFile && (
          <label className="field field--password">
            <span>Mot de passe de la clé privée</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassphrase(event.currentTarget.value)}
              type="password"
              value={passphrase}
            />
          </label>
        )}
        {!privateKeyFile && defaultPrivateKey && (
          <p className="inline-hint">Une clé privée générée dans cette session est disponible.</p>
        )}
      </div>

      <div className="operation-footer">
        <p><FileKey2 size={16} />Le téléchargement n’est créé qu’après validation AES-GCM.</p>
        <button
          className="button button--primary button--large"
          disabled={busy || !packageFile || (!privateKeyFile && !defaultPrivateKey)}
          onClick={handleDecrypt}
          type="button"
        >
          {busy ? <LoaderCircle className="spin" size={18} /> : <FileLock2 size={18} />}
          {busy ? 'Déchiffrement en cours…' : 'Déchiffrer le fichier'}
        </button>
      </div>

      {message && <p className="feedback feedback--success" role="status">{message}</p>}
      {error && (
        <p className="feedback feedback--error" role="alert">
          <AlertCircle size={17} />{error}
        </p>
      )}
      <p className="security-note">
        Un mot de passe ou une clé incorrects, un paquet corrompu ou une modification du contenu empêche toute restitution.
      </p>
    </section>
  )
}
