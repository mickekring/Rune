import { useCallback, useEffect, useState } from 'react'
import type { FileRelations, TagIndexSnapshot } from '@shared/types/tags'
import type { FileHistory } from '@shared/types/history'
import { api } from '@/lib/api'

// Read-only views of main-process data that refresh on the light
// `tags:index-changed` / `history:changed` events.

/** Relations of one note; refetched whenever the tag index changes. */
export function useFileRelations(filePath: string | null): FileRelations | null {
  const [relations, setRelations] = useState<FileRelations | null>(null)

  useEffect(() => {
    if (!filePath) {
      setRelations(null)
      return
    }
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const data = await api.getRelations(filePath)
        if (!cancelled) setRelations(data)
      } catch (error) {
        console.error('Failed to load file relations:', error)
        if (!cancelled) setRelations(null)
      }
    }
    void load()
    const unsubscribe = window.api.on('tags:index-changed', () => void load())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [filePath])

  return relations
}

/** Snapshot list of one note; refetched when main reports a change for it. */
export function useFileHistory(filePath: string | null): FileHistory | null {
  const [history, setHistory] = useState<FileHistory | null>(null)

  useEffect(() => {
    if (!filePath) {
      setHistory(null)
      return
    }
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const data = await api.listHistory(filePath)
        if (!cancelled) setHistory(data)
      } catch (error) {
        console.error('Failed to load file history:', error)
        if (!cancelled) setHistory(null)
      }
    }
    void load()
    const unsubscribe = window.api.on('history:changed', (update) => {
      if (update.filePath === filePath) void load()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [filePath])

  return history
}

/** The whole tag index while `enabled`; refetched on every index change. */
export function useTagIndex(enabled: boolean): TagIndexSnapshot | null {
  const [snapshot, setSnapshot] = useState<TagIndexSnapshot | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const data = await api.getTagIndex()
        if (!cancelled) setSnapshot(data)
      } catch (error) {
        console.error('Failed to load tag index:', error)
      }
    }
    void load()
    const unsubscribe = window.api.on('tags:index-changed', () => void load())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [enabled])

  return snapshot
}

/** Installed Ollama models with a manual refetch. */
export function useOllamaModels(enabled = true): {
  models: string[]
  error: string | null
  loading: boolean
  refetch: () => void
} {
  const [models, setModels] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.listModels()
      if (result.ok) {
        setModels(result.models.map((m) => m.name))
        setError(null)
      } else {
        setModels([])
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled) void refetch()
  }, [enabled, refetch])

  return { models, error, loading, refetch }
}
