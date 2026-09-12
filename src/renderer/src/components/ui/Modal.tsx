import type { ReactNode } from 'react'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface ModalProps {
  isOpen: boolean
  /** Backdrop click and Escape (unless `onEscape` is given). */
  onClose?: () => void
  /** Custom Escape behaviour, e.g. clear a filter before closing. */
  onEscape?: () => void
  /** Classes for the panel; sizing and layout live here. */
  className?: string
  /** Set false for blocking dialogs (welcome screen). */
  closeOnBackdrop?: boolean
  children: ReactNode
}

/** Shared overlay shell: fixed backdrop, centered panel, Escape handling. */
export function Modal({
  isOpen,
  onClose,
  onEscape,
  className = '',
  closeOnBackdrop = true,
  children
}: ModalProps) {
  const escape = onEscape ?? onClose
  useEscapeKey(isOpen && !!escape, () => escape?.())

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative bg-background border border-border rounded-xl shadow-2xl overflow-hidden animate-fade-in ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
