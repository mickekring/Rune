import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FileRelations } from '@shared/types/tags'
import type { FileHistory, SnapshotMeta } from '@shared/types/history'
import type { DocumentStats } from '@shared/types/store'
import { baseName, noteTitle } from '@shared/paths'
import { api } from '@/lib/api'
import { useAppStore } from '@/store'
import { useFileHistory, useFileRelations } from '@/hooks/useVaultData'
import { ChevronIcon, GripIcon, RestoreIcon, SnapshotIcon, TrashIcon } from '../ui/icons'
import { AIChatSection } from './AIChatSection'

// IDs used to persist section expand state globally. Keep the literals
// stable — renaming would lose the user's persisted preferences.
const SECTION_DOCUMENT_INFO = 'document-info'
const SECTION_RELATIONS = 'relations'
const SECTION_HISTORY = 'history'
const SECTION_AI_CHAT = 'ai-chat'

const ALL_SECTIONS = [SECTION_DOCUMENT_INFO, SECTION_RELATIONS, SECTION_HISTORY, SECTION_AI_CHAT]

const EXPANDED_DEFAULTS: Record<string, boolean> = {
  [SECTION_DOCUMENT_INFO]: false,
  [SECTION_RELATIONS]: true,
  [SECTION_HISTORY]: false,
  [SECTION_AI_CHAT]: false
}

const EMPTY_TAGS: string[] = []

interface RightSidebarProps {
  width: number
  isVisible: boolean
  onOpenFile: (path: string) => void
  onCreateSnapshot: () => void
  onRestoreSnapshot: (snapshotId: string) => void
  onDeleteSnapshot: (snapshotId: string) => void
  onOpenSettings: () => void
  getDocumentText: () => string
}

export const RightSidebar = memo(function RightSidebar({
  width,
  isVisible,
  onOpenFile,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onOpenSettings,
  getDocumentText
}: RightSidebarProps) {
  const currentFile = useAppStore((s) => s.editor.currentFile)
  const stats = useAppStore((s) => s.editor.stats)
  const sectionsExpanded = useAppStore((s) => s.ui.sectionsExpanded)
  const sectionOrder = useAppStore((s) => s.ui.sectionOrder)
  const expandedRelations = useAppStore((s) =>
    currentFile ? (s.ui.expandedRelations[currentFile] ?? EMPTY_TAGS) : EMPTY_TAGS
  )
  const relations = useFileRelations(isVisible ? currentFile : null)
  const history = useFileHistory(isVisible ? currentFile : null)

  // Drag state lives in a ref so the drop handler always sees the current
  // value regardless of render timing.
  const draggingIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  // Persisted order first, unknown ids dropped, new sections appended.
  const orderedIds = useMemo(() => {
    const userOrder = sectionOrder.filter((id) => ALL_SECTIONS.includes(id))
    if (userOrder.length === 0) return ALL_SECTIONS
    return [...userOrder, ...ALL_SECTIONS.filter((id) => !userOrder.includes(id))]
  }, [sectionOrder])

  const toggleRelation = useCallback(
    (tag: string) => {
      if (currentFile) void api.toggleRelationExpanded(currentFile, tag)
    },
    [currentFile]
  )

  if (!isVisible) return null

  const resetDrag = (): void => {
    draggingIdRef.current = null
    setDraggingId(null)
    setDropTargetId(null)
  }

  const renderSection = (id: string): ReactNode => {
    const expanded = sectionsExpanded[id] ?? EXPANDED_DEFAULTS[id] ?? false
    const common = {
      id,
      expanded,
      dragging: draggingId === id,
      isDropTarget: dropTargetId === id && draggingId !== id,
      onDragStart: () => {
        draggingIdRef.current = id
        setDraggingId(id)
      },
      onDragEnd: resetDrag,
      onDragEnter: () => {
        const src = draggingIdRef.current
        if (src && src !== id) setDropTargetId(id)
      }
    }

    switch (id) {
      case SECTION_DOCUMENT_INFO:
        return (
          <CollapsibleSection key={id} title="Document Info" {...common}>
            <DocumentInfoBody stats={stats} fileName={currentFile ? baseName(currentFile) : null} />
          </CollapsibleSection>
        )
      case SECTION_RELATIONS:
        return (
          <CollapsibleSection key={id} title="Relations" {...common}>
            <RelationsBody
              relations={relations}
              onOpenFile={onOpenFile}
              expandedRelations={expandedRelations}
              onToggle={toggleRelation}
            />
          </CollapsibleSection>
        )
      case SECTION_HISTORY:
        return (
          <CollapsibleSection key={id} title="History" {...common}>
            <HistoryBody
              history={history}
              canSnapshot={!!currentFile}
              onCreateSnapshot={onCreateSnapshot}
              onRestoreSnapshot={onRestoreSnapshot}
              onDeleteSnapshot={onDeleteSnapshot}
            />
          </CollapsibleSection>
        )
      case SECTION_AI_CHAT:
        return (
          <CollapsibleSection key={id} title="AI Chat" keepMounted {...common}>
            <AIChatSection
              currentFile={currentFile}
              getDocumentText={getDocumentText}
              onOpenSettings={onOpenSettings}
            />
          </CollapsibleSection>
        )
      default:
        return null
    }
  }

  return (
    <aside
      className="flex flex-col border-l border-border-subtle overflow-hidden"
      style={{ width, background: 'var(--color-sidebar-alt)' }}
    >
      <div className="pt-[52px] titlebar-drag-region">
        <div className="titlebar-no-drag" />
      </div>

      {/* Delegated drop handler: resolves the section under the cursor by
          walking up the DOM, so drops on nested elements land reliably. */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-5"
        onDragOver={(e) => {
          if (draggingIdRef.current) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }
        }}
        onDrop={(e) => {
          const draggedId = e.dataTransfer.getData('text/plain') || draggingIdRef.current
          const target = (e.target as HTMLElement | null)?.closest('[data-section-id]')
          const targetId = target?.getAttribute('data-section-id') ?? null
          if (!draggedId || !targetId || targetId === draggedId) {
            resetDrag()
            return
          }
          e.preventDefault()
          const next = orderedIds.filter((s) => s !== draggedId)
          const targetIdx = next.indexOf(targetId)
          if (targetIdx >= 0) {
            next.splice(targetIdx, 0, draggedId)
            void api.setSectionOrder(next)
          }
          resetDrag()
        }}
      >
        {orderedIds.map(renderSection)}
      </div>
    </aside>
  )
})

// --- CollapsibleSection ---------------------------------------------------

function CollapsibleSection({
  id,
  title,
  expanded,
  dragging,
  isDropTarget,
  keepMounted = false,
  onDragStart,
  onDragEnd,
  onDragEnter,
  children
}: {
  id: string
  title: string
  expanded: boolean
  dragging: boolean
  isDropTarget: boolean
  /** Keep children mounted while collapsed (preserves chat state). */
  keepMounted?: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragEnter: () => void
  children: ReactNode
}) {
  return (
    <section
      data-section-id={id}
      className={`rounded-lg border overflow-hidden transition-colors ${
        isDropTarget ? 'border-primary' : 'border-border-subtle'
      } ${dragging ? 'opacity-40' : ''}`}
      style={{
        background: isDropTarget
          ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
          : 'color-mix(in srgb, var(--color-muted) 30%, transparent)'
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        onDragEnter()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
    >
      <div className="w-full flex items-center gap-1 pr-3 hover:bg-sidebar-hover transition-colors">
        <span
          className="flex-shrink-0 pl-2 py-2 cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-muted-foreground"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', id)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          aria-label="Drag to reorder section"
        >
          <GripIcon size={12} />
        </span>
        <button
          className="flex-1 flex items-center justify-between py-2 pl-1"
          onClick={() => void api.setSectionExpanded(id, !expanded)}
          aria-expanded={expanded}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h2>
          <ChevronIcon
            size={10}
            className={`text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>
      </div>
      {(expanded || keepMounted) && (
        <div className="px-3 pt-3 pb-3 border-t border-border-subtle" hidden={!expanded}>
          {children}
        </div>
      )}
    </section>
  )
}

// --- Document Info body ---------------------------------------------------

function DocumentInfoBody({ stats, fileName }: { stats: DocumentStats | null; fileName: string | null }) {
  if (!stats || !fileName) {
    return <p className="text-xs text-muted-foreground py-2">Open a note to see stats.</p>
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">File</h3>
        <p className="text-sm text-foreground truncate font-mono">{fileName}</p>
      </div>

      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Statistics
        </h3>
        <div className="space-y-1.5">
          <StatRow label="Words" value={stats.wordCount} />
          <StatRow label="Characters" value={stats.characterCount} />
          <StatRow label="Paragraphs" value={stats.paragraphs} />
          <StatRow label="Sentences" value={stats.sentences} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Reading Time
        </h3>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground font-mono">
            {stats.readingTimeMinutes}
          </span>
          <span className="text-sm text-muted-foreground">
            {stats.readingTimeMinutes === 1 ? 'minute' : 'minutes'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Based on 200 wpm average</p>
      </div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground font-mono tabular-nums">{value.toLocaleString()}</span>
    </div>
  )
}

// --- Relations body -------------------------------------------------------

function RelationsBody({
  relations,
  onOpenFile,
  expandedRelations,
  onToggle
}: {
  relations: FileRelations | null
  onOpenFile: (path: string) => void
  expandedRelations: string[]
  onToggle: (tag: string) => void
}) {
  if (!relations) {
    return <p className="text-xs text-muted-foreground py-2">Open a note to see its relations.</p>
  }
  if (relations.tags.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Add <code className="text-[0.9em]">#tag</code> anywhere in this note to see related notes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {relations.tags.map((tagInfo) => (
        <TagRelationGroup
          key={tagInfo.tag}
          tag={tagInfo.tag}
          taggedIn={tagInfo.taggedIn}
          mentionedIn={tagInfo.mentionedIn}
          onOpenFile={onOpenFile}
          expanded={expandedRelations.includes(tagInfo.tag)}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

function TagRelationGroup({
  tag,
  taggedIn,
  mentionedIn,
  onOpenFile,
  expanded,
  onToggle
}: {
  tag: string
  taggedIn: string[]
  mentionedIn: string[]
  onOpenFile: (path: string) => void
  expanded: boolean
  onToggle: (tag: string) => void
}) {
  const total = taggedIn.length + mentionedIn.length
  return (
    <div className="border border-border-subtle rounded-md">
      <button
        className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-sidebar-hover rounded-md transition-colors"
        onClick={() => onToggle(tag)}
      >
        <span className="flex items-center gap-2 min-w-0">
          <ChevronIcon
            size={10}
            className={`text-muted-foreground flex-shrink-0 transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
          <span className="text-sm font-medium truncate" style={{ color: 'var(--color-primary)' }}>
            #{tag}
          </span>
        </span>
        <span className="text-xs text-muted-foreground font-mono tabular-nums pl-2">{total}</span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {taggedIn.length > 0 && <RelationList label="Also tagged" files={taggedIn} onOpenFile={onOpenFile} />}
          {mentionedIn.length > 0 && <RelationList label="Mentioned" files={mentionedIn} onOpenFile={onOpenFile} />}
          {total === 0 && <p className="text-xs text-muted-foreground px-1">No other notes yet.</p>}
        </div>
      )}
    </div>
  )
}

function RelationList({
  label,
  files,
  onOpenFile
}: {
  label: string
  files: string[]
  onOpenFile: (path: string) => void
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground/70 px-1 py-1">{label}</div>
      <ul className="space-y-0.5">
        {files.map((path) => (
          <li key={path}>
            <button
              className="w-full text-left text-sm text-foreground/90 hover:text-foreground hover:bg-sidebar-hover rounded px-1.5 py-1 truncate transition-colors"
              onClick={() => onOpenFile(path)}
              title={path}
            >
              {noteTitle(path)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// --- History body ---------------------------------------------------------

function HistoryBody({
  history,
  canSnapshot,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot
}: {
  history: FileHistory | null
  canSnapshot: boolean
  onCreateSnapshot: () => void
  onRestoreSnapshot: (snapshotId: string) => void
  onDeleteSnapshot: (snapshotId: string) => void
}) {
  const snapshots = history?.snapshots ?? []

  return (
    <div className="space-y-2">
      <button
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{
          background: canSnapshot
            ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)'
            : 'var(--color-muted)',
          color: canSnapshot ? 'var(--color-primary)' : 'var(--color-muted-foreground)'
        }}
        onClick={onCreateSnapshot}
        disabled={!canSnapshot}
        title={canSnapshot ? 'Save a snapshot of the current note' : 'Open a note first'}
      >
        <SnapshotIcon size={12} />
        Save snapshot
      </button>

      {snapshots.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No snapshots yet. Click "Save snapshot" to mark a version you can return to.
        </p>
      ) : (
        <ul className="space-y-1">
          {snapshots.map((snap) => (
            <SnapshotRow
              key={snap.id}
              snapshot={snap}
              onRestore={() => onRestoreSnapshot(snap.id)}
              onDelete={() => onDeleteSnapshot(snap.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function SnapshotRow({
  snapshot,
  onRestore,
  onDelete
}: {
  snapshot: SnapshotMeta
  onRestore: () => void
  onDelete: () => void
}) {
  const date = new Date(snapshot.timestamp)
  return (
    <li className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-sidebar-hover transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground/90 truncate font-mono">
          {formatSnapshotDate(date)}
          {snapshot.kind === 'auto' && (
            <span className="ml-1.5 text-[0.7em] uppercase tracking-wider text-muted-foreground/80 font-sans">
              auto
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatRelativeTime(date)} · {formatBytes(snapshot.size)}
        </div>
      </div>
      <button
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-60 group-hover:opacity-100 transition-opacity"
        onClick={onRestore}
        title="Restore this snapshot"
        aria-label="Restore snapshot"
      >
        <RestoreIcon size={12} />
      </button>
      <button
        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted opacity-60 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        title="Delete this snapshot"
        aria-label="Delete snapshot"
      >
        <TrashIcon size={12} />
      </button>
    </li>
  )
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatSnapshotDate(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
