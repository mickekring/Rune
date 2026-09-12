import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { FileNode } from '@shared/types/store'
import { api } from '@/lib/api'
import { useAppStore } from '@/store'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { StatusBar } from './StatusBar'
import { ResizeHandle } from './ResizeHandle'
import { SettingsModal } from '../modals/SettingsModal'
import { TagConstellation } from '../modals/TagConstellation'
import { TagManagerModal } from '../modals/TagManagerModal'

interface AppLayoutProps {
  children: ReactNode
  onFileSelect: (path: string) => void
  onNewFile: (folder?: string) => void
  onNewFolder: (parent: string, name: string) => Promise<boolean>
  onDeleteNode: (node: FileNode) => Promise<boolean>
  onRenameNode: (node: FileNode, name: string) => Promise<boolean>
  onMoveNode: (draggedPath: string, targetFolder: string) => Promise<boolean>
  onCreateSnapshot: () => void
  onRestoreSnapshot: (snapshotId: string) => void
  onDeleteSnapshot: (snapshotId: string) => void
  /** Save the editor before an operation that rewrites notes on disk. */
  onFlushEditor: () => Promise<boolean>
  onSave: () => void
  getDocumentText: () => string
  onChangeVault: () => void
}

const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 400

export function AppLayout({
  children,
  onFileSelect,
  onNewFile,
  onNewFolder,
  onDeleteNode,
  onRenameNode,
  onMoveNode,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onFlushEditor,
  onSave,
  getDocumentText,
  onChangeVault
}: AppLayoutProps) {
  const hydrated = useAppStore((s) => s.hydrated)
  const leftVisible = useAppStore((s) => s.ui.leftSidebarVisible)
  const rightVisible = useAppStore((s) => s.ui.rightSidebarVisible)
  const storedLeftWidth = useAppStore((s) => s.ui.leftSidebarWidth)
  const storedRightWidth = useAppStore((s) => s.ui.rightSidebarWidth)
  const currentFile = useAppStore((s) => s.editor.currentFile)

  const [showSettings, setShowSettings] = useState(false)
  const [showConstellation, setShowConstellation] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Local mirrors so dragging a handle feels instant; the store value is
  // committed once on mouse-up and re-synced after hydration.
  const [leftWidth, setLeftWidth] = useState(storedLeftWidth)
  const [rightWidth, setRightWidth] = useState(storedRightWidth)
  useEffect(() => setLeftWidth(storedLeftWidth), [storedLeftWidth])
  useEffect(() => setRightWidth(storedRightWidth), [storedRightWidth])

  const commitLeftWidth = useCallback((width: number) => {
    setLeftWidth(width)
    void api.setSidebarWidth('left', width)
  }, [])
  const commitRightWidth = useCallback((width: number) => {
    setRightWidth(width)
    void api.setSidebarWidth('right', width)
  }, [])

  const openSettings = useCallback(() => setShowSettings(true), [])
  const closeSettings = useCallback(() => setShowSettings(false), [])
  const openConstellation = useCallback(() => setShowConstellation(true), [])
  const closeConstellation = useCallback(() => setShowConstellation(false), [])
  const openTagManager = useCallback(() => setShowTagManager(true), [])
  const closeTagManager = useCallback(() => setShowTagManager(false), [])
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useGlobalShortcuts({
    onSave,
    onOpenSearch: openSearch,
    onOpenConstellation: openConstellation,
    onOpenTagManager: openTagManager
  })

  if (!hydrated) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse-subtle">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <LeftSidebar
          width={leftWidth}
          isVisible={leftVisible}
          selectedFile={currentFile}
          searchOpen={searchOpen}
          onOpenSearch={openSearch}
          onCloseSearch={closeSearch}
          onFileSelect={onFileSelect}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onDeleteNode={onDeleteNode}
          onRenameNode={onRenameNode}
          onMoveNode={onMoveNode}
          onOpenSettings={openSettings}
          onOpenConstellation={openConstellation}
          onOpenTagManager={openTagManager}
        />

        {leftVisible && (
          <ResizeHandle
            side="left"
            currentWidth={leftWidth}
            minWidth={SIDEBAR_MIN}
            maxWidth={SIDEBAR_MAX}
            onResize={setLeftWidth}
            onResizeEnd={commitLeftWidth}
          />
        )}

        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          <div className="h-[52px] titlebar-drag-region flex-shrink-0" />
          <div className="flex-1 overflow-hidden">{children}</div>
        </main>

        {rightVisible && (
          <ResizeHandle
            side="right"
            currentWidth={rightWidth}
            minWidth={SIDEBAR_MIN}
            maxWidth={SIDEBAR_MAX}
            onResize={setRightWidth}
            onResizeEnd={commitRightWidth}
          />
        )}

        <RightSidebar
          width={rightWidth}
          isVisible={rightVisible}
          onOpenFile={onFileSelect}
          onCreateSnapshot={onCreateSnapshot}
          onRestoreSnapshot={onRestoreSnapshot}
          onDeleteSnapshot={onDeleteSnapshot}
          onOpenSettings={openSettings}
          getDocumentText={getDocumentText}
        />
      </div>

      <StatusBar />

      <SettingsModal isOpen={showSettings} onClose={closeSettings} onChangeVault={onChangeVault} />
      <TagConstellation isOpen={showConstellation} onClose={closeConstellation} onOpenFile={onFileSelect} />
      <TagManagerModal isOpen={showTagManager} onClose={closeTagManager} onBeforeRemove={onFlushEditor} />
    </div>
  )
}
