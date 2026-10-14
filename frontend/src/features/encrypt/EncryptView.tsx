import { AlertCircle, FileLock2, Fingerprint, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FileDropZone } from '../../components/FileDropZone'
import {
  assertFileSize,
  encryptedDownloadName,
  encryptFileToContainer,
  MAX_FILE_SIZE,
} from '../../crypto/fileContainer'
import { getPublicKeyFingerprint, importPublicKeyPem } from '../../crypto/keyFiles'
import { downloadBlob } from '../../utils/download'
import { formatFileSize, getSafeErrorMessage } from '../../utils/format'
import { hasSecureCryptoContext } from '../../utils/secureContext'

type EncryptViewProps = {
  defaultPublicKey: CryptoKey | null
}

export function EncryptView({ defaultPublicKey }: EncryptViewProps) {
  const [recipientPublicKey, setRecipientPublicKey] = useState<CryptoKey | null>(defaultPublicKey)
  const [fingerprint, setFingerprint] = useState('')
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [keyImportBusy, setKeyImportBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const keyImportRequest = useRef(0)

  useEffect(() => {
    if (!recipientPublicKey) return
    let active = true
    void getPublicKeyFingerprint(recipientPublicKey)
      .then((value) => {
        if (active) setFingerprint(value)
      })
      .catch((cause: unknown) => {
        if (active) setError(getSafeErrorMessage(cause))
      })
    return () => {
      active = false
    }
  }, [recipientPublicKey])

  const handlePublicKeyFile = async (selectedFile: File | null) => {
    const requestId = ++keyImportRequest.current
    setKeyImportBusy(false)
    setKeyFile(selectedFile)
    setError('')
    setMessage('')
    if (!selectedFile) {
      setRecipientPublicKey(defaultPublicKey)
      setFingerprint('')
      return
    }

    setFingerprint('')
    setRecipientPublicKey(null)
    if (!hasSecureCryptoContext()) {
      setError('La cryptographie exige HTTPS ou localhost dans un navigateur compatible.')
      return
    }

    setKeyImportBusy(true)
    try {
      const importedKey = await importPublicKeyPem(selectedFile)
      if (requestId !== keyImportRequest.current) return
      setRecipientPublicKey(importedKey)
      setMessage('Clé publique importée. Vérifiez son empreinte avec le binôme.')
    } catch (cause) {
      if (requestId !== keyImportRequest.current) return
      setFingerprint('')
      setError(getSafeErrorMessage(cause))
    } finally {
      if (requestId === keyImportRequest.current) setKeyImportBusy(false)
    }
  }

  const handleFile = (selectedFile: File | null) => {
    setFile(selectedFile)
    setError('')
    setMessage('')
    if (selectedFile) {
      try {
        assertFileSize(selectedFile.size)
      } catch (cause) {
        setError(getSafeErrorMessage(cause))
      }
    }
  }

  const handleEncrypt = async () => {
    setError('')
    setMessage('')
    if (!file) {
      setError('Sélectionnez le fichier à chiffrer.')
      return
    }
    if (!recipientPublicKey) {
      setError('Importez la clé publique SPKI du destinataire.')
      return
    }
    if (!hasSecureCryptoContext()) {
      setError('La cryptographie exige HTTPS ou localhost dans un navigateur compatible.')
      return
    }

    setBusy(true)
    try {
      const encrypted = await encryptFileToContainer(file, recipientPublicKey)
      downloadBlob(encrypted, encryptedDownloadName(file.name))
      setMessage('Fichier chiffré téléchargé. Vous pouvez le transmettre au destinataire.')
    } catch (cause) {
      setError(getSafeErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="view-stack" aria-labelledby="encrypt-heading">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Chiffrement</p>
          <h1 id="encrypt-heading">Protéger un fichier</h1>
          <p className="view-intro">
            Le chiffrement s’effectue dans votre navigateur. Le serveur ne reçoit jamais le fichier.
          </p>
        </div>
        <span className="status-pill status-pill--good"><ShieldCheck size={15} />Local et privé</span>
      </div>

      <div className="card flow-card">
        <div className="step-heading">
          <span className="step-number">01</span>
          <div>
            <h2>Clé publique du destinataire</h2>
            <p>Importez le fichier SPKI PEM transmis par votre binôme.</p>
          </div>
        </div>
        <FileDropZone
          accept=".pem,.pub"
          description="Format PEM — la clé publique peut être partagée"
          file={keyFile}
          label="Déposez la clé publique ici"
          onFile={(selectedFile) => void handlePublicKeyFile(selectedFile)}
        />
        {keyImportBusy && <p className="inline-hint" role="status">Vérification de la clé publique…</p>}
        {recipientPublicKey && fingerprint && (
          <div className="key-confirmation">
            <Fingerprint size={17} />
            <span>Empreinte à vérifier avec le destinataire</span>
            <code>{fingerprint}</code>
          </div>
        )}
        {!recipientPublicKey && (
          <p className="inline-hint">Générez une paire ou importez la clé publique avant de continuer.</p>
        )}
      </div>

      <div className="card flow-card">
        <div className="step-heading">
          <span className="step-number">02</span>
          <div>
            <h2>Fichier à chiffrer</h2>
            <p>La taille maximale est de 50 Mio; le contenu ne quitte pas cet appareil.</p>
          </div>
        </div>
        <FileDropZone
          description="Déposez un fichier ou choisissez-le sur votre appareil"
          file={file}
          label="Déposez votre fichier ici"
          onFile={handleFile}
        />
        {file && (
          <div className="file-summary">
            <span><strong>Nom</strong>{file.name}</span>
            <span><strong>Taille</strong>{formatFileSize(file.size)}</span>
            <span><strong>Type</strong>{file.type || 'Non défini'}</span>
          </div>
        )}
      </div>

      <div className="operation-footer">
        <p><FileLock2 size={16} />Un paquet .rsaenc versionné sera créé et téléchargé.</p>
        <button
          className="button button--primary button--large"
          disabled={busy || !file || file.size > MAX_FILE_SIZE || !recipientPublicKey}
          onClick={handleEncrypt}
          type="button"
        >
          {busy ? <LoaderCircle className="spin" size={18} /> : <FileLock2 size={18} />}
          {busy ? 'Chiffrement en cours…' : 'Chiffrer et télécharger'}
        </button>
      </div>

      {message && <p className="feedback feedback--success" role="status">{message}</p>}
      {error && (
        <p className="feedback feedback--error" role="alert">
          <AlertCircle size={17} />{error}
        </p>
      )}
      <p className="security-note">
        Le chiffrement protège la confidentialité, mais ne signe pas le fichier et ne prouve pas l’identité de l’expéditeur.
      </p>
      <CryptoDisclaimer />
    </section>
  )
}

function CryptoDisclaimer() {
  return (
    <details className="details-note">
      <summary>Pourquoi le chiffrement est hybride ?</summary>
      <p>
        RSA-OAEP protège une clé AES temporaire; AES-GCM chiffre le fichier et détecte toute modification.
        Les métadonnées de nom et de type peuvent rester visibles dans le paquet.
      </p>
    </details>
  )
}
