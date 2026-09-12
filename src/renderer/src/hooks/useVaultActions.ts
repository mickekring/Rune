import { useCallback } from 'react'
import type { FileNode } from '@shared/types/store'
import { baseName, isInsideDir, joinPath, parentDir, sanitizeName } from '@shared/paths'
import { api } from '@/lib/api'
import { showNotice, useAppStore } from '@/store'
import type { EditorBuffer } from './useEditorBuffer'

// Vault mutations as the UI sees them. Every operation flushes the editor
// first where unsaved text could otherwise be lost, reports failures in
// the status bar, and keeps the open note's path in step with renames.
// The file tree itself is refreshed by main after each mutation.

export interface VaultActions {
  createNote: (folder?: string) => Promise<void>
  createFolder: (parent: string, name: string) => Promise<boolean>
  deleteNode: (node: FileNode) => Promise<boolean>
  renameNode: (node: FileNode, newName: string) => Promise<boolean>
  moveNode: (draggedPath: string, targetFolder: string) => Promise<boolean>
  renameCurrentTitle: (title: string) => Promise<void>
  changeVault: () => Promise<void>
}

export function useVaultActions(buffer: EditorBuffer): VaultActions {
  const { openFile, flush, closeFile, remapPath, getCurrentFile } = buffer

  const createNote = useCallback(
    async (folder?: string) => {
      const vaultPath = useAppStore.getState().settings.vaultPath
      if (!vaultPath) return
      if (!(await flush())) return
      const stamp = new Date().toISOString().split('T')[0]
      const path = joinPath(folder ?? vaultPath, `Untitled-${stamp}-${Date.now().toString(36)}.md`)
      const frontmatter = `---\ntitle: Untitled\ncreated: ${new Date().toISOString()}\n---\n\n`
      const result = await api.createFile(path, frontmatter)
      if (!result.ok) {
        showNotice('error', `Could not create note: ${result.error}`)
        return
      }
      await openFile(path)
    },
    [flush, openFile]
  )

  const createFolder = useCallback(async (parent: string, name: string) => {
    const clean = sanitizeName(name)
    if (!clean) {
      showNotice('error', 'That folder name is not usable')
      return false
    }
    const result = await api.createFolder(joinPath(parent, clean))
    if (!result.ok) showNotice('error', `Could not create folder: ${result.error}`)
    return result.ok
  }, [])

  const deleteNode = useCallback(
    async (node: FileNode) => {
      const result =
        node.type === 'folder' ? await api.deleteFolder(node.path) : await api.deleteFile(node.path)
      if (!result.ok) {
        showNotice('error', `Could not delete: ${result.error}`)
        return false
      }
      const current = getCurrentFile()
      if (current && isInsideDir(node.path, current)) closeFile()
      showNotice('info', `Moved "${node.name}" to the Trash`)
      return true
    },
    [closeFile, getCurrentFile]
  )

  const renameTo = useCallback(
    async (oldPath: string, newPath: string) => {
      if (newPath === oldPath) return true
      const current = getCurrentFile()
      if (current && isInsideDir(oldPath, current) && !(await flush())) return false
      const result = await api.renameFile(oldPath, newPath)
      if (!result.ok) {
        showNotice('error', `Could not rename: ${result.error}`)
        return false
      }
      remapPath(oldPath, newPath)
      return true
    },
    [flush, getCurrentFile, remapPath]
  )

  const renameNode = useCallback(
    async (node: FileNode, newName: string) => {
      const clean = sanitizeName(newName)
      if (!clean) {
        showNotice('error', 'That name is not usable')
        return false
      }
      const target = node.type === 'file' ? `${clean}.md` : clean
      return renameTo(node.path, joinPath(parentDir(node.path), target))
    },
    [renameTo]
  )

  const moveNode = useCallback(
    async (draggedPath: string, targetFolder: string) => {
      if (isInsideDir(draggedPath, targetFolder)) return false
      return renameTo(draggedPath, joinPath(targetFolder, baseName(draggedPath)))
    },
    [renameTo]
  )

  const renameCurrentTitle = useCallback(
    async (title: string) => {
      const current = getCurrentFile()
      if (!current) return
      const clean = sanitizeName(title)
      if (!clean) {
        showNotice('error', 'That title is not usable as a file name')
        return
      }
      await renameTo(current, joinPath(parentDir(current), `${clean}.md`))
    },
    [getCurrentFile, renameTo]
  )

  const changeVault = useCallback(async () => {
    const path = await api.selectVault()
    if (!path) return
    if (!(await flush())) return
    closeFile()
    const result = await api.openVault(path)
    if (!result.ok) showNotice('error', `Could not open vault: ${result.error}`)
  }, [closeFile, flush])

  return { createNote, createFolder, deleteNode, renameNode, moveNode, renameCurrentTitle, changeVault }
}
