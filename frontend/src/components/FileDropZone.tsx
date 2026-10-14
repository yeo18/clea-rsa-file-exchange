import { FileUp } from 'lucide-react'
import { useId } from 'react'
import { formatFileSize } from '../utils/format'

type FileDropZoneProps = {
  accept?: string
  description: string
  file: File | null
  label: string
  onFile: (file: File | null) => void
}

export function FileDropZone({
  accept,
  description,
  file,
  label,
  onFile,
}: FileDropZoneProps) {
  const inputId = useId()

  return (
    <label
      className={`drop-zone${file ? ' drop-zone--selected' : ''}`}
      htmlFor={inputId}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        onFile(event.dataTransfer.files.item(0))
      }}
    >
      <input
        accept={accept}
        className="visually-hidden"
        id={inputId}
        onChange={(event) => onFile(event.currentTarget.files?.item(0) ?? null)}
        type="file"
      />
      <span className="drop-zone__icon" aria-hidden="true">
        <FileUp size={20} />
      </span>
      <span className="drop-zone__body">
        <span className="drop-zone__title">
          {file ? file.name : label}
        </span>
        <span className="drop-zone__description">
          {file ? `${formatFileSize(file.size)}${file.type ? ` · ${file.type}` : ''}` : description}
        </span>
      </span>
      <span className="drop-zone__action">{file ? 'Remplacer' : 'Parcourir'}</span>
    </label>
  )
}
