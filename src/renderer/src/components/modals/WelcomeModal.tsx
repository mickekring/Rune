import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { FolderOutlineIcon, LogoIcon, SpinnerIcon } from '../ui/icons'

interface WelcomeModalProps {
  isOpen: boolean
  /** Why the persisted vault could not be opened, if that is the reason. */
  error: string | null
  onSelectVault: () => Promise<void>
}

export function WelcomeModal({ isOpen, error, onSelectVault }: WelcomeModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSelectVault = async (): Promise<void> => {
    setIsLoading(true)
    try {
      await onSelectVault()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} closeOnBackdrop={false} className="w-full max-w-md mx-4 bg-sidebar">
      <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />
      <div className="p-8">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center text-primary">
          <LogoIcon size={32} />
        </div>
        <h1 className="text-2xl font-semibold text-center mb-2">Welcome to Rune</h1>
        <p className="text-muted-foreground text-center mb-8">
          Your personal workspace for notes, projects, and ideas. Select a folder to use as your vault.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive text-center">
            {error}
          </div>
        )}

        <button
          onClick={() => void handleSelectVault()}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-accent-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <SpinnerIcon className="animate-spin" />
              <span>Opening vault...</span>
            </>
          ) : (
            <>
              <FolderOutlineIcon />
              <span>Select Vault Folder</span>
            </>
          )}
        </button>

        <p className="mt-6 text-xs text-muted-foreground text-center">
          A vault is a folder on your computer where all your notes are stored as plain markdown files.
        </p>
      </div>
    </Modal>
  )
}
