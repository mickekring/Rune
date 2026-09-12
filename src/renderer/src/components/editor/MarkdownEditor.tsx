import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import type { Result } from '@shared/ipc'
import { useCodeMirror } from '@/editor/useCodeMirror'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif'])

interface MarkdownEditorProps {
  /** Text to mount with. Remount (change the key) to show another document. */
  initialValue: string
  onChange: (value: string) => void
  onCursorChange: (line: number, column: number) => void
  onDropFile: (sourcePath: string) => Promise<Result<{ filename: string; relativePath: string }>>
}

export interface MarkdownEditorHandle {
  getValue: () => string
  getCaret: () => number
  focus: () => void
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ initialValue, onChange, onCursorChange, onDropFile }, ref) {
    const [isDragOver, setIsDragOver] = useState(false)
    const { containerRef, viewRef, getValue, getCaret, focus } = useCodeMirror({
      initialValue,
      onChange,
      onCursorChange
    })

    useImperativeHandle(ref, () => ({ getValue, getCaret, focus }), [getValue, getCaret, focus])

    useEffect(() => {
      const timer = setTimeout(focus, 50)
      return () => clearTimeout(timer)
    }, [focus])

    const handleDragOver = useCallback((e: React.DragEvent) => {
      // Only react to OS-level file drags (not text selection drags).
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      if (e.currentTarget === e.target) setIsDragOver(false)
    }, [])

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        const files = Array.from(e.dataTransfer.files)
        if (files.length === 0) return
        e.preventDefault()
        setIsDragOver(false)

        const snippets: string[] = []
        for (const file of files) {
          const sourcePath = window.api.getFilePath(file)
          if (!sourcePath) continue
          const result = await onDropFile(sourcePath)
          if (!result.ok) continue
          const ext = result.filename.slice(result.filename.lastIndexOf('.')).toLowerCase()
          const name = result.filename.slice(0, ext.length ? -ext.length : undefined)
          // encodeURI keeps "/" while escaping spaces and unicode, which
          // the markdown parser needs to see a valid link destination.
          const link = encodeURI(result.relativePath)
          snippets.push(IMAGE_EXTENSIONS.has(ext) ? `![${name}](${link})` : `[${name}](${link})`)
        }
        if (snippets.length === 0) return

        const view = viewRef.current
        if (!view) return
        const pos = view.state.selection.main.head
        const insert = `${snippets.join('\n')}\n`
        view.dispatch({
          changes: { from: pos, to: pos, insert },
          selection: { anchor: pos + insert.length }
        })
        view.focus()
      },
      [onDropFile, viewRef]
    )

    return (
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`h-full w-full overflow-auto focus-within:outline-none relative ${
          isDragOver ? 'editor-drop-target' : ''
        }`}
      />
    )
  }
)
