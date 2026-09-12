import { memo, useCallback, useMemo, useState } from 'react'
import type { FileNode } from '@shared/types/store'
import { MEDIA_FOLDER_NAME } from '@shared/constants'
import { baseName, parentDir, stripMarkdownExtension } from '@shared/paths'
import { api } from '@/lib/api'
import { useAppStore } from '@/store'
import { InputModal } from '../modals/InputModal'
import { ConfirmModal } from '../modals/ConfirmModal'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'
import {
  ChevronIcon,
  ConstellationIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  NewFolderIcon,
  NewNoteIcon,
  RenameIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
  TrashIcon
} from '../ui/icons'
import { SearchPanel } from './SearchPanel'

interface LeftSidebarProps {
  width: number
  isVisible: boolean
  selectedFile: string | null
  searchOpen: boolean
  onOpenSearch: () => void
  onCloseSearch: () => void
  onFileSelect: (path: string) => void
  onNewFile: (folder?: string) => void
  onNewFolder: (parent: string, name: string) => Promise<boolean>
  onDeleteNode: (node: FileNode) => Promise<boolean>
  onRenameNode: (node: FileNode, name: string) => Promise<boolean>
  onMoveNode: (draggedPath: string, targetFolder: string) => Promise<boolean>
  onOpenSettings: () => void
  onOpenConstellation: () => void
  onOpenTagManager: () => void
}

interface ContextMenuState {
  x: number
  y: number
  node: FileNode
}

/** Callbacks shared by every tree row; stable so rows can be memoised. */
interface TreeCallbacks {
  onSelect: (path: string) => void
  onSelectFolder: (path: string | null) => void
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
  onDragOver: (path: string | null) => void
  onDrop: (targetFolder: string, draggedPath: string) => void
  onToggleFolder: (folderId: string) => void
}

const toggleFolder = (folderId: string): void => void api.toggleFolderExpanded(folderId)

export const LeftSidebar = memo(function LeftSidebar({
  width,
  isVisible,
  selectedFile,
  searchOpen,
  onOpenSearch,
  onCloseSearch,
  onFileSelect,
  onNewFile,
  onNewFolder,
  onDeleteNode,
  onRenameNode,
  onMoveNode,
  onOpenSettings,
  onOpenConstellation,
  onOpenTagManager
}: LeftSidebarProps) {
  const vaultPath = useAppStore((s) => s.settings.vaultPath)
  const fileTree = useAppStore((s) => s.fileTree)
  const expandedFolders = useAppStore((s) => s.ui.expandedFolders)

  const [folderModalTarget, setFolderModalTarget] = useState<string | null | undefined>(undefined)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renameTarget, setRenameTarget] = useState<FileNode | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  const notes = useMemo(
    () => fileTree.filter((n) => !(n.type === 'folder' && n.name === MEDIA_FOLDER_NAME)),
    [fileTree]
  )
  const media = useMemo(
    () => fileTree.filter((n) => n.type === 'folder' && n.name === MEDIA_FOLDER_NAME),
    [fileTree]
  )
  const expandedSet = useMemo(() => new Set(expandedFolders), [expandedFolders])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const handleDrop = useCallback(
    (targetFolder: string, draggedPath: string) => {
      setDragOverFolder(null)
      void onMoveNode(draggedPath, targetFolder)
    },
    [onMoveNode]
  )

  const tree = useMemo<TreeCallbacks>(
    () => ({
      onSelect: onFileSelect,
      onSelectFolder: setSelectedFolder,
      onContextMenu: handleContextMenu,
      onDragOver: setDragOverFolder,
      onDrop: handleDrop,
      onToggleFolder: toggleFolder
    }),
    [onFileSelect, handleContextMenu, handleDrop]
  )

  // Early return goes AFTER all hooks so the hook count stays stable.
  if (!isVisible) return null

  const vaultName = vaultPath ? baseName(vaultPath) : null

  const contextMenuItems = (node: FileNode): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    if (node.type === 'folder') {
      items.push(
        { label: 'New Note', icon: <NewNoteIcon />, onClick: () => onNewFile(node.path) },
        {
          label: 'New Folder',
          icon: <NewFolderIcon />,
          onClick: () => setFolderModalTarget(node.path),
          divider: true
        }
      )
    }
    items.push(
      { label: 'Rename', icon: <RenameIcon />, onClick: () => setRenameTarget(node) },
      {
        label: 'Delete',
        icon: <TrashIcon />,
        onClick: () => setDeleteTarget(node),
        variant: 'destructive',
        divider: true
      }
    )
    return items
  }

  const treeState = { selectedFile, selectedFolder, dragOverFolder, expandedSet }

  return (
    <>
      <aside
        className="flex flex-col bg-sidebar border-r border-border-subtle overflow-hidden"
        style={{ width }}
      >
        <div className="pt-[52px] px-4 pb-3 titlebar-drag-region">
          <div className="titlebar-no-drag flex items-center justify-between gap-2">
            {vaultName ? (
              <h1 className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">
                {vaultName}
              </h1>
            ) : (
              <span className="text-sm text-muted-foreground flex-1 min-w-0">No vault</span>
            )}
            <HeaderButton title="Search (⌘K)" onClick={onOpenSearch}>
              <SearchIcon />
            </HeaderButton>
            <HeaderButton title="Tag Constellation (⌘⇧G)" onClick={onOpenConstellation}>
              <ConstellationIcon />
            </HeaderButton>
            <HeaderButton title="Manage Tags (⌘⇧T)" onClick={onOpenTagManager}>
              <TagIcon />
            </HeaderButton>
            <HeaderButton title="Settings" onClick={onOpenSettings}>
              <SettingsIcon />
            </HeaderButton>
          </div>
        </div>

        <div className="h-px bg-border-subtle mx-3" />

        {searchOpen ? (
          <div className="flex-1 min-h-0">
            <SearchPanel onClose={onCloseSearch} onOpenFile={onFileSelect} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
            {fileTree.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {vaultName ? 'No notes yet' : 'Select a vault to begin'}
                </p>
              </div>
            ) : (
              <>
                <FileTreeNodes nodes={notes} depth={0} tree={tree} {...treeState} />
                {media.length > 0 && (
                  <>
                    <div className="h-px bg-border-subtle mx-3 my-2" />
                    <div className="px-4 pt-1 pb-1 text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">
                      Media Vault
                    </div>
                    <FileTreeNodes nodes={media} depth={0} tree={tree} {...treeState} />
                  </>
                )}
              </>
            )}
          </div>
        )}

        <div className="p-2 border-t border-border-subtle flex gap-2">
          <button
            className="btn-ghost flex-1 flex items-center gap-1.5 justify-center text-xs titlebar-no-drag"
            disabled={!vaultPath}
            onClick={() => setFolderModalTarget(null)}
          >
            <NewFolderIcon size={14} />
            <span>Folder</span>
          </button>
          <button
            className="btn-ghost flex-1 flex items-center gap-1.5 justify-center text-xs titlebar-no-drag"
            disabled={!vaultPath}
            onClick={() => onNewFile()}
          >
            <NewNoteIcon size={14} />
            <span>Note</span>
          </button>
        </div>
      </aside>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {folderModalTarget !== undefined && vaultPath && (
        <InputModal
          title="New Folder"
          placeholder="Folder name"
          confirmLabel="Create"
          onConfirm={async (name) => {
            const parent = folderModalTarget ?? vaultPath
            setFolderModalTarget(undefined)
            await onNewFolder(parent, name)
          }}
          onCancel={() => setFolderModalTarget(undefined)}
        />
      )}

      {renameTarget && (
        <InputModal
          title={`Rename ${renameTarget.type === 'folder' ? 'Folder' : 'Note'}`}
          placeholder="New name"
          defaultValue={stripMarkdownExtension(renameTarget.name)}
          confirmLabel="Rename"
          onConfirm={async (name) => {
            const node = renameTarget
            setRenameTarget(null)
            await onRenameNode(node, name)
          }}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.type === 'folder' ? 'Folder' : 'Note'}`}
          message={`Move "${stripMarkdownExtension(deleteTarget.name)}" to the Trash?`}
          confirmLabel="Move to Trash"
          variant="destructive"
          onConfirm={async () => {
            const node = deleteTarget
            setDeleteTarget(null)
            await onDeleteNode(node)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
})

function HeaderButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      className="p-1 rounded hover:bg-sidebar-hover text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  )
}

interface TreeState {
  selectedFile: string | null
  selectedFolder: string | null
  dragOverFolder: string | null
  expandedSet: Set<string>
}

interface FileTreeNodesProps extends TreeState {
  nodes: FileNode[]
  depth: number
  tree: TreeCallbacks
}

const FileTreeNodes = memo(function FileTreeNodes({ nodes, depth, tree, ...state }: FileTreeNodesProps) {
  return (
    <div>
      {nodes.map((node) => (
        <FileTreeItem key={node.id} node={node} depth={depth} tree={tree} {...state} />
      ))}
    </div>
  )
})

interface FileTreeItemProps extends TreeState {
  node: FileNode
  depth: number
  tree: TreeCallbacks
}

const FileTreeItem = memo(function FileTreeItem({ node, depth, tree, ...state }: FileTreeItemProps) {
  const isFolder = node.type === 'folder'
  const isExpanded = state.expandedSet.has(node.id)
  const isActive = state.selectedFile === node.path
  const isFolderSelected = isFolder && state.selectedFolder === node.path
  const isDragOver = state.dragOverFolder === node.path
  const paddingLeft = 12 + depth * 16

  // vault_media is a system folder: not renameable, deletable, draggable,
  // or right-clickable, and shown under a friendlier name.
  const isSystemFolder = isFolder && node.id === MEDIA_FOLDER_NAME
  const displayName = isSystemFolder ? 'Media Vault' : stripMarkdownExtension(node.name)

  const handleClick = (): void => {
    if (isFolder) {
      tree.onToggleFolder(node.id)
      tree.onSelectFolder(node.path)
    } else {
      tree.onSelectFolder(parentDir(node.path))
      tree.onSelect(node.path)
    }
  }

  const handleDragStart = (e: React.DragEvent): void => {
    if (isSystemFolder) {
      e.preventDefault()
      return
    }
    e.stopPropagation()
    e.dataTransfer.setData('text/plain', node.path)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent): void => {
    if (!isFolder) return
    // Skip OS file drags (those are handled by the editor).
    const types = Array.from(e.dataTransfer.types)
    if (types.includes('Files') && !types.includes('text/plain')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    tree.onDragOver(node.path)
  }

  const handleDropEvent = (e: React.DragEvent): void => {
    if (!isFolder) return
    const draggedPath = e.dataTransfer.getData('text/plain')
    if (!draggedPath) return
    e.preventDefault()
    e.stopPropagation()
    if (draggedPath !== node.path) tree.onDrop(node.path, draggedPath)
    tree.onDragOver(null)
  }

  return (
    <>
      <button
        className={`file-tree-item w-full text-left flex items-center gap-2 py-1.5 pr-3 text-sm titlebar-no-drag ${
          isActive ? 'active' : ''
        } ${isFolderSelected ? 'bg-muted/50' : ''} ${
          isDragOver ? 'bg-accent/20 border border-accent' : ''
        }`}
        style={{ paddingLeft }}
        onClick={handleClick}
        onContextMenu={(e) => {
          if (isSystemFolder) {
            e.preventDefault()
            return
          }
          tree.onContextMenu(e, node)
        }}
        draggable={!isSystemFolder}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => tree.onDragOver(null)}
        onDrop={handleDropEvent}
      >
        {isFolder ? (
          <>
            <ChevronIcon
              size={12}
              className={`text-muted-foreground flex-shrink-0 transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
            />
            {isExpanded ? (
              <FolderOpenIcon size={15} className="flex-shrink-0 folder-icon" />
            ) : (
              <FolderIcon size={15} className="flex-shrink-0 folder-icon" />
            )}
          </>
        ) : (
          <FileIcon size={14} className="text-foreground/80 flex-shrink-0 ml-5" />
        )}
        <span
          className={`truncate ${
            isFolder ? 'font-medium text-foreground' : isActive ? 'text-foreground' : 'text-foreground/90'
          }`}
        >
          {displayName}
        </span>
      </button>

      {isFolder && isExpanded && node.children && (
        <FileTreeNodes nodes={node.children} depth={depth + 1} tree={tree} {...state} />
      )}
    </>
  )
})
