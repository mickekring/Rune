import { readdirSync, type Dirent } from 'fs'
import { join } from 'path'
import type { FileNode } from '@shared/types/store'
import { MEDIA_FOLDER_NAME } from '@shared/constants'
import { isMarkdownFile } from '@shared/paths'

// Sync-service and editor junk that must never surface in the tree.
// Dot-prefixed names (`.DS_Store`, iCloud `.Name.md.icloud` placeholders,
// Syncthing `.sync-conflict-*`, LibreOffice `.~lock.*#`) are skipped by
// the dot check; these are the remaining non-dot forms.
const JUNK_FILENAME_PATTERNS: RegExp[] = [
  /^~\$/, // MS Office / LibreOffice lock files
  /\.crdownload$/i, // Chrome partial download
  /\.part$/i, // generic partial transfer
  /\.tmp$/i,
  /\.temp$/i
]

export function isHiddenOrJunk(name: string): boolean {
  if (name.startsWith('.')) return true
  return JUNK_FILENAME_PATTERNS.some((re) => re.test(name))
}

function readEntries(dirPath: string): Dirent[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error)
    return []
  }
}

/**
 * Build the vault tree. Symbolic links are skipped entirely (they are the
 * one way a synced vault can point outside itself), non-markdown files are
 * only listed inside `vault_media/`, and one unreadable entry never hides
 * its siblings. No per-file stat: `withFileTypes` already tells us the
 * kind, and nothing reads modification times.
 */
export function buildFileTree(
  dirPath: string,
  parentId = '',
  allowAllFiles = false
): FileNode[] {
  const items: FileNode[] = []

  for (const entry of readEntries(dirPath)) {
    if (isHiddenOrJunk(entry.name) || entry.isSymbolicLink()) continue
    const isDir = entry.isDirectory()
    const isFile = entry.isFile()
    if (!isDir && !isFile) continue

    const isMediaRoot = parentId === '' && entry.name === MEDIA_FOLDER_NAME
    if (isFile && !allowAllFiles && !isMarkdownFile(entry.name)) continue

    const id = parentId ? `${parentId}/${entry.name}` : entry.name
    const node: FileNode = {
      id,
      name: entry.name,
      path: join(dirPath, entry.name),
      type: isDir ? 'folder' : 'file'
    }
    if (isDir) {
      node.children = buildFileTree(node.path, id, allowAllFiles || isMediaRoot)
    }
    items.push(node)
  }

  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return items
}

/** Absolute paths of every note in the tree, excluding the media folder. */
export function collectMarkdownFiles(tree: FileNode[], out: string[] = []): string[] {
  for (const node of tree) {
    if (node.id === MEDIA_FOLDER_NAME) continue
    if (node.type === 'file') {
      if (isMarkdownFile(node.name)) out.push(node.path)
    } else if (node.children) {
      collectMarkdownFiles(node.children, out)
    }
  }
  return out
}
