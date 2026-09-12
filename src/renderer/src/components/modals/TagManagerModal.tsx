import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { showNotice } from '@/store'
import { useTagIndex } from '@/hooks/useVaultData'
import { Modal } from '../ui/Modal'
import { CloseIcon, SearchIcon } from '../ui/icons'

interface TagManagerModalProps {
  isOpen: boolean
  onClose: () => void
  /** Save the editor first so a rewrite never races unsaved text. */
  onBeforeRemove: () => Promise<boolean>
}

type SortMode = 'count' | 'name'

interface TagRow {
  display: string
  lower: string
  count: number
}

interface RecentResult {
  tag: string
  filesModified: number
  occurrencesRemoved: number
}

export function TagManagerModal({ isOpen, onClose, onBeforeRemove }: TagManagerModalProps) {
  const index = useTagIndex(isOpen)
  const [filter, setFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('count')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [busyTag, setBusyTag] = useState<string | null>(null)
  const [recentResult, setRecentResult] = useState<RecentResult | null>(null)

  // Reset transient UI state whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return
    setFilter('')
    setPendingDelete(null)
    setBusyTag(null)
    setRecentResult(null)
  }, [isOpen])

  const rows = useMemo<TagRow[]>(() => {
    if (!index) return []
    const items = index.allTags.map((display) => ({
      display,
      lower: display.toLowerCase(),
      count: (index.filesByTag[display] ?? []).length
    }))
    const q = filter.trim().toLowerCase().replace(/^#+/, '')
    const filtered = q ? items.filter((r) => r.lower.includes(q)) : items
    filtered.sort((a, b) => {
      if (sortMode === 'count' && a.count !== b.count) return b.count - a.count
      return a.display.localeCompare(b.display)
    })
    return filtered
  }, [index, filter, sortMode])

  const totalTags = index?.allTags.length ?? 0

  const handleEscape = (): void => {
    if (pendingDelete) setPendingDelete(null)
    else if (filter) setFilter('')
    else onClose()
  }

  const handleConfirmDelete = async (tag: string): Promise<void> => {
    setBusyTag(tag)
    try {
      if (!(await onBeforeRemove())) return
      const result = await api.removeTag(tag)
      setRecentResult({
        tag,
        filesModified: result.filesModified.length,
        occurrencesRemoved: result.occurrencesRemoved
      })
    } catch (error) {
      console.error('TagManager: failed to remove tag', error)
      showNotice('error', 'Could not remove the tag')
    } finally {
      setBusyTag(null)
      setPendingDelete(null)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onEscape={handleEscape}
      className="w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col rounded-lg"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
        <div>
          <h1 className="text-base font-semibold text-foreground">Tag Manager</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalTags === 0
              ? 'No tags in this vault yet.'
              : `${totalTags} tag${totalTags === 1 ? '' : 's'} in this vault`}
          </p>
        </div>
        <button
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2 px-5 py-3 border-b border-border-subtle">
        <div className="relative flex-1">
          <SearchIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tags…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-muted/50 border border-border-subtle focus:outline-none focus:border-primary placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center rounded-md border border-border-subtle overflow-hidden text-xs">
          {(['count', 'name'] as const).map((mode) => (
            <button
              key={mode}
              className={`px-2.5 py-1.5 transition-colors ${
                sortMode === mode
                  ? 'bg-accent text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-hover'
              }`}
              onClick={() => setSortMode(mode)}
              title={mode === 'count' ? 'Sort by note count (descending)' : 'Sort A–Z'}
            >
              {mode === 'count' ? 'Count' : 'A–Z'}
            </button>
          ))}
        </div>
      </div>

      {recentResult && (
        <div className="px-5 py-2 text-xs text-muted-foreground bg-muted/30 border-b border-border-subtle">
          Removed <span className="text-primary font-medium">#{recentResult.tag}</span> from{' '}
          {recentResult.filesModified} note{recentResult.filesModified === 1 ? '' : 's'} (
          {recentResult.occurrencesRemoved} occurrence{recentResult.occurrencesRemoved === 1 ? '' : 's'}).
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-5 py-10 text-sm text-center text-muted-foreground">
            {totalTags === 0 ? 'Add #tags to your notes and they will show up here.' : 'No tags match the filter.'}
          </div>
        ) : (
          <ul>
            {rows.map((row) => {
              const isPending = pendingDelete === row.display
              const isBusy = busyTag === row.display
              return (
                <li
                  key={row.display}
                  className="px-5 py-2 flex items-center gap-3 border-b border-border-subtle last:border-b-0 hover:bg-sidebar-hover/50 transition-colors"
                >
                  {isPending ? (
                    <>
                      <div className="flex-1 text-sm text-foreground">
                        Remove the <span className="text-primary font-medium">#</span> from{' '}
                        <span className="font-medium">{row.display}</span> in {row.count} note
                        {row.count === 1 ? '' : 's'}? The word stays.
                      </div>
                      <button
                        className="px-2.5 py-1 text-xs rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        onClick={() => setPendingDelete(null)}
                        disabled={isBusy}
                      >
                        Cancel
                      </button>
                      <button
                        className="px-2.5 py-1 text-xs rounded bg-destructive/90 hover:bg-destructive text-white transition-colors disabled:opacity-50"
                        onClick={() => void handleConfirmDelete(row.display)}
                        disabled={isBusy}
                      >
                        {isBusy ? 'Removing…' : 'Remove'}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-primary truncate">#{row.display}</span>
                      <span className="text-xs text-muted-foreground flex-1">
                        {row.count} note{row.count === 1 ? '' : 's'}
                      </span>
                      <button
                        className="px-2.5 py-1 text-xs rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => setPendingDelete(row.display)}
                        title={`Remove # from ${row.count} note(s)`}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="px-5 py-2.5 text-[11px] text-muted-foreground border-t border-border-subtle bg-muted/20">
        Deleting a tag strips the leading <code>#</code> from every occurrence. The word itself is
        preserved, and each modified note gets an automatic snapshot in History.
      </div>
    </Modal>
  )
}
