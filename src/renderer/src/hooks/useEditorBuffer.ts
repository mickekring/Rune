import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { AUTOSAVE_DEBOUNCE_MS } from '@shared/constants'
import { isInsideDir, noteTitle } from '@shared/paths'
import type { DocumentStats } from '@shared/types/store'
import { api, errorMessage } from '@/lib/api'
import { clearNotice, showNotice, useAppStore } from '@/store'
import type { MarkdownEditorHandle } from '@/components/editor/MarkdownEditor'

// The one owner of "the buffer": which note is open, its latest text,
// whether it is dirty, and when it gets saved. Text lives in refs so a
// keystroke never re-renders the app; the status bar and sidebars read
// derived status from the store.
//
// Saving is race-free by construction: every edit bumps `editVersion`,
// and a completed save only clears the dirty flag if no edit happened
// while it was in flight and the note is still the same one. A failed
// save keeps the buffer dirty and surfaces the error.

export interface EditorDoc {
  path: string | null
  /** Text the editor was mounted with. Changes only on open/replace. */
  content: string
  /** Bumped whenever the editor must remount with fresh state. */
  version: number
}

export interface EditorBuffer {
  doc: EditorDoc
  editorRef: RefObject<MarkdownEditorHandle | null>
  getCurrentFile: () => string | null
  getContent: () => string
  openFile: (path: string) => Promise<boolean>
  closeFile: () => void
  handleChange: (content: string) => void
  handleCursorChange: (line: number, column: number) => void
  /** Save now if dirty. Resolves true when the buffer is clean afterwards. */
  save: () => Promise<boolean>
  /** Cancel the pending autosave and save now. */
  flush: () => Promise<boolean>
  /** Replace the open note's text (snapshot restore) without marking it dirty. */
  replaceContent: (content: string) => void
  /** Follow a rename or move of the open note or a folder above it. */
  remapPath: (oldPath: string, newPath: string) => void
}

export function computeStats(text: string): DocumentStats {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return {
    wordCount: words,
    characterCount: text.length,
    readingTimeMinutes: Math.max(1, Math.ceil(words / 200)),
    paragraphs: text
      .trim()
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0).length,
    sentences: (text.match(/[.!?]+/g) ?? []).length
  }
}

export function useEditorBuffer(): EditorBuffer {
  const [doc, setDoc] = useState<EditorDoc>({ path: null, content: '', version: 0 })
  const setEditor = useAppStore((s) => s.setEditor)

  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const pathRef = useRef<string | null>(null)
  const contentRef = useRef('')
  const dirtyRef = useRef(false)
  const editVersionRef = useRef(0)
  const inFlightRef = useRef<Promise<boolean> | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const statsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearTimers = (): void => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (statsTimerRef.current) clearTimeout(statsTimerRef.current)
    saveTimerRef.current = undefined
    statsTimerRef.current = undefined
  }

  const save = useCallback(async (): Promise<boolean> => {
    // Serialise: a save that starts while another is in flight waits for
    // it, then re-checks whether anything is still dirty.
    if (inFlightRef.current) await inFlightRef.current
    const path = pathRef.current
    if (!path || !dirtyRef.current) return true

    const version = editVersionRef.current
    const content = contentRef.current
    const caretOffset = editorRef.current?.getCaret()
    setEditor({ isSaving: true })

    const run = (async (): Promise<boolean> => {
      try {
        const result = await api.writeFile(path, content, { caretOffset })
        if (!result.ok) {
          showNotice('error', `Save failed: ${result.error}`)
          return false
        }
        if (pathRef.current === path && editVersionRef.current === version) {
          dirtyRef.current = false
          setEditor({ isDirty: false })
        }
        if (result.conflictCopy) {
          showNotice(
            'info',
            `This note changed on disk while you were editing. The other version was kept as "${noteTitle(result.conflictCopy)}".`
          )
        } else if (useAppStore.getState().editor.notice?.kind === 'error') {
          clearNotice()
        }
        return true
      } catch (error) {
        showNotice('error', `Save failed: ${errorMessage(error)}`)
        return false
      } finally {
        setEditor({ isSaving: false })
      }
    })()

    inFlightRef.current = run
    try {
      return await run
    } finally {
      if (inFlightRef.current === run) inFlightRef.current = null
    }
  }, [setEditor])

  const flush = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = undefined
    return save()
  }, [save])

  const handleChange = useCallback(
    (content: string) => {
      contentRef.current = content
      editVersionRef.current += 1
      if (!dirtyRef.current) {
        dirtyRef.current = true
        setEditor({ isDirty: true })
      }
      if (statsTimerRef.current) clearTimeout(statsTimerRef.current)
      statsTimerRef.current = setTimeout(() => {
        setEditor({ stats: computeStats(contentRef.current) })
      }, 300)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS)
    },
    [save, setEditor]
  )

  const handleCursorChange = useCallback(
    (line: number, column: number) => {
      setEditor({ cursorLine: line, cursorColumn: column })
    },
    [setEditor]
  )

  const mountDoc = useCallback(
    (path: string | null, content: string) => {
      clearTimers()
      pathRef.current = path
      contentRef.current = content
      dirtyRef.current = false
      editVersionRef.current += 1
      setDoc((prev) => ({ path, content, version: prev.version + 1 }))
      setEditor({
        currentFile: path,
        isDirty: false,
        cursorLine: 1,
        cursorColumn: 1,
        stats: path ? computeStats(content) : null
      })
    },
    [setEditor]
  )

  const openFile = useCallback(
    async (path: string): Promise<boolean> => {
      if (pathRef.current === path) return true
      // Never switch away from unsaved text: if the save fails the user
      // stays on the note and sees the error.
      if (!(await flush())) return false
      const result = await api.readFile(path)
      if (!result.ok) {
        showNotice('error', `Could not open note: ${result.error}`)
        return false
      }
      clearNotice()
      mountDoc(path, result.content)
      void api.setLastOpenedFile(path)
      return true
    },
    [flush, mountDoc]
  )

  const closeFile = useCallback(() => {
    mountDoc(null, '')
    void api.setLastOpenedFile(null)
  }, [mountDoc])

  const replaceContent = useCallback(
    (content: string) => {
      mountDoc(pathRef.current, content)
    },
    [mountDoc]
  )

  const remapPath = useCallback(
    (oldPath: string, newPath: string) => {
      const current = pathRef.current
      if (!current || !isInsideDir(oldPath, current)) return
      const next = newPath + current.slice(oldPath.length)
      pathRef.current = next
      setDoc((prev) => ({ ...prev, path: next }))
      setEditor({ currentFile: next })
      void api.setLastOpenedFile(next)
    },
    [setEditor]
  )

  // Reload silently when main rewrote the open note (tag propagation or
  // removal) and nothing is dirty. A dirty buffer always wins.
  useEffect(() => {
    return window.api.on('file:external-change', ({ paths }) => {
      const current = pathRef.current
      if (!current || dirtyRef.current || !paths.includes(current)) return
      void api.readFile(current).then((result) => {
        if (result.ok && pathRef.current === current && !dirtyRef.current) {
          mountDoc(current, result.content)
          showNotice('info', 'Note updated to reflect tag changes')
        }
      })
    })
  }, [mountDoc])

  // Save eagerly when focus leaves the window or the page goes away.
  useEffect(() => {
    const onBlur = (): void => void flush()
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') void flush()
    }
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onBlur)
    return () => {
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBlur)
    }
  }, [flush])

  useEffect(() => clearTimers, [])

  const getCurrentFile = useCallback(() => pathRef.current, [])
  const getContent = useCallback(() => contentRef.current, [])

  return {
    doc,
    editorRef,
    getCurrentFile,
    getContent,
    openFile,
    closeFile,
    handleChange,
    handleCursorChange,
    save,
    flush,
    replaceContent,
    remapPath
  }
}
