import { useEffect, useRef } from 'react'
import { useEscapeKey } from '@/hooks/useEscapeKey'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'destructive'
  divider?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  useEscapeKey(true, onClose)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    // Delay so the opening right-click does not immediately close it.
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  // Keep the menu on screen.
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.right > window.innerWidth) el.style.left = `${x - rect.width}px`
    if (rect.bottom > window.innerHeight) el.style.top = `${y - rect.height}px`
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] bg-background border border-border rounded-lg shadow-xl py-1 overflow-hidden"
      style={{ left: x, top: y }}
      role="menu"
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.divider && <div className="h-px bg-border my-1" />}
          <button
            role="menuitem"
            className={`w-full px-3 py-1.5 text-sm text-left flex items-center gap-2 transition-colors ${
              item.variant === 'destructive'
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-foreground hover:bg-muted'
            }`}
            onClick={() => {
              item.onClick()
              onClose()
            }}
          >
            {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
