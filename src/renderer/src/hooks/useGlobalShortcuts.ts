import { useEffect, useRef } from 'react'

export interface GlobalShortcuts {
  /** ⌘S */
  onSave: () => void
  /** ⌘K */
  onOpenSearch: () => void
  /** ⌘⇧G */
  onOpenConstellation: () => void
  /** ⌘⇧T */
  onOpenTagManager: () => void
}

/** One keydown listener for every app-wide shortcut. */
export function useGlobalShortcuts(shortcuts: GlobalShortcuts): void {
  const ref = useRef(shortcuts)
  ref.current = shortcuts

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (e.shiftKey) {
        if (key === 'g') {
          e.preventDefault()
          ref.current.onOpenConstellation()
        } else if (key === 't') {
          e.preventDefault()
          ref.current.onOpenTagManager()
        }
        return
      }
      if (key === 's') {
        e.preventDefault()
        ref.current.onSave()
      } else if (key === 'k') {
        e.preventDefault()
        ref.current.onOpenSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
