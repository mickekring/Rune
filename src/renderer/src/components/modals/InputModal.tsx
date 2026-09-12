import { useState } from 'react'
import { Modal } from '../ui/Modal'

interface InputModalProps {
  title: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

/** Render conditionally; it is open for as long as it is mounted. */
export function InputModal({
  title,
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'Create',
  onConfirm,
  onCancel
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue)

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (value.trim()) onConfirm(value.trim())
  }

  return (
    <Modal isOpen onClose={onCancel} className="w-full max-w-sm mx-4">
      <form onSubmit={handleSubmit}>
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">{title}</h2>
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-accent-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
