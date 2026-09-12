import { useEffect, useRef, useState } from 'react'

interface EditableTitleProps {
  value: string
  onChange: (newValue: string) => void
}

export function EditableTitle({ value, onChange }: EditableTitleProps) {
  const [editValue, setEditValue] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isEditing = editValue !== null

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const commit = (): void => {
    const next = (editValue ?? '').trim()
    setEditValue(null)
    if (next && next !== value) onChange(next)
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            setEditValue(null)
          }
        }}
        className="w-full text-3xl font-bold bg-transparent border-none outline-none text-foreground py-4 focus:ring-0"
        placeholder="Untitled"
      />
    )
  }

  return (
    <h1
      className="text-3xl font-bold text-foreground py-4 cursor-text hover:text-foreground/80 transition-colors truncate"
      onDoubleClick={() => setEditValue(value)}
      title="Double-click to rename"
    >
      {value || 'Untitled'}
    </h1>
  )
}
