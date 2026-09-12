import { BrowserWindow, dialog, shell } from 'electron'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { basename, extname, join, sep } from 'path'
import type { Err, EventData } from '@shared/ipc'
import type { ChatMessageSend } from '@shared/types/ai'
import { APP_DIR_NAME, MEDIA_FOLDER_NAME } from '@shared/constants'
import { mainStore } from '../store'
import { tagsService } from '../services/tags-service'
import { historyService } from '../services/history-service'
import { listModels, streamChat } from '../services/ollama-service'
import { isSafeExternalUrl, safeInsideVault } from '../services/path-guard'
import { buildFileTree, collectMarkdownFiles } from '../services/vault-walk'
import {
  forgetPath,
  movePath,
  readVaultFile,
  writeVaultFile
} from '../services/vault-files'
import { broadcast, handle, sendTo } from './bridge'

// Vault roots the user picked through the native dialog this session,
// plus the persisted one. `vault:open` accepts nothing else, so the
// renderer cannot move the confinement root somewhere it likes.
const allowedVaultRoots = new Set<string>()

// Files `attachment:open` may hand to the OS default handler. Anything
// else (scripts, apps, archives, unknown types) is revealed in the file
// manager instead, so a synced note can never launch code with a click.
const OPENABLE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif', '.heic', '.tif', '.tiff',
  '.pdf', '.txt', '.md', '.csv', '.json', '.rtf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
  '.pages', '.numbers', '.key', '.epub',
  '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg',
  '.mp4', '.mov', '.m4v', '.webm'
])

function fail(error: string): Err {
  return { ok: false, error }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function safeRealpath(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

function currentVault(): string | null {
  return mainStore.getState().settings.vaultPath
}

function refreshTree(): void {
  const root = currentVault()
  if (!root) return
  const tree = buildFileTree(root)
  mainStore.getState().setFileTree(tree)
  broadcast('store:state-changed', { fileTree: tree })
}

function broadcastIndex(): void {
  broadcast('tags:index-changed', { version: tagsService.getVersion() })
}

function notifyRewrites(
  paths: string[],
  reason: EventData<'file:external-change'>['reason']
): void {
  if (paths.length === 0) return
  broadcast('file:external-change', { paths, reason })
  for (const filePath of paths) broadcast('history:changed', { filePath })
}

// Refuse vault roots that would confine "everything": the filesystem
// root, the home folder, top-level folders like /Users, and volume roots.
function isForbiddenVaultRoot(real: string): boolean {
  if (real === '/' || real === safeRealpath(homedir())) return true
  if (/^[A-Za-z]:\\?$/.test(real)) return true
  if (/^\/Volumes\/[^/]+\/?$/.test(real)) return true
  return real.split(sep).filter(Boolean).length <= 1
}

function ensureVaultConfig(root: string): void {
  const dir = join(root, APP_DIR_NAME)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const config = join(dir, 'config.json')
  if (!existsSync(config)) {
    writeFileSync(config, JSON.stringify({ version: 1, createdAt: Date.now() }, null, 2))
  }
}

function afterNoteChanged(safe: string, content: string, caretOffset?: number): void {
  tagsService.updateFile(safe, content)
  const propagated = tagsService.propagateTags(safe, caretOffset)
  broadcastIndex()
  notifyRewrites(propagated, 'propagation')
}

// Copy an OS-dropped file into {vault}/vault_media/ with collision-safe
// naming. The source path comes from the renderer: reject symlinks and
// non-regular files, and take only the basename so a `\` on Windows can
// never smuggle a destination through join().
function saveAttachment(
  vaultPath: string,
  sourcePath: string
): { filename: string; relativePath: string } {
  const stat = lstatSync(sourcePath)
  if (stat.isSymbolicLink()) throw new Error('Symbolic links cannot be attached')
  if (!stat.isFile()) throw new Error('Only regular files can be attached')

  const mediaDir = join(vaultPath, MEDIA_FOLDER_NAME)
  if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true })

  const originalName = basename(sourcePath)
  const ext = extname(originalName)
  const base = ext ? originalName.slice(0, -ext.length) : originalName
  let filename = originalName
  let destPath = join(mediaDir, filename)
  let counter = 1
  while (existsSync(destPath)) {
    filename = `${base}-${counter}${ext}`
    destPath = join(mediaDir, filename)
    counter += 1
  }
  copyFileSync(sourcePath, destPath)
  return { filename, relativePath: `${MEDIA_FOLDER_NAME}/${filename}` }
}

// Move a file or folder to the OS Trash instead of deleting permanently.
async function trashPath(path: string): Promise<void> {
  await shell.trashItem(path)
  forgetPath(path)
}

function sameInode(a: string, b: string): boolean {
  try {
    return statSync(a).ino === statSync(b).ino
  } catch {
    return false
  }
}

export function registerIPCHandlers(): void {
  const persisted = currentVault()
  if (persisted) {
    const real = safeRealpath(persisted)
    if (real) allowedVaultRoots.add(real)
  }

  // --- Vault ----------------------------------------------------------

  handle('dialog:select-vault', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Vault Location',
      buttonLabel: 'Select Vault'
    })
    if (result.canceled || !result.filePaths[0]) return null
    const real = safeRealpath(result.filePaths[0])
    if (!real) return null
    allowedVaultRoots.add(real)
    return real
  })

  handle('vault:open', async (_, path) => {
    if (typeof path !== 'string') return fail('Invalid vault path')
    const real = safeRealpath(path)
    if (!real) return fail(`Vault folder not found: ${path}`)
    if (!allowedVaultRoots.has(real)) return fail('Choose the vault through the folder picker')
    if (isForbiddenVaultRoot(real)) {
      return fail('Use a dedicated folder for the vault, not the home folder or a drive root')
    }
    try {
      if (!statSync(real).isDirectory()) return fail('The vault path is not a folder')
      ensureVaultConfig(real)
    } catch (error) {
      return fail(messageOf(error))
    }

    const tree = buildFileTree(real)
    const store = mainStore.getState()
    store.setFileTree(tree)
    store.setVaultPath(real)
    historyService.setVaultPath(real)
    tagsService.scanVault(real, collectMarkdownFiles(tree))

    broadcast('store:state-changed', { settings: { vaultPath: real }, fileTree: tree })
    broadcastIndex()
    return { ok: true, fileTree: tree, vaultPath: real }
  })

  // --- Files ----------------------------------------------------------

  handle('file:read', async (_, path) => {
    const safe = safeInsideVault(path)
    if (!safe) return fail('Path is outside the vault')
    try {
      return { ok: true, content: readVaultFile(safe) }
    } catch (error) {
      return fail(messageOf(error))
    }
  })

  handle('file:write', async (_, path, content, options) => {
    const safe = safeInsideVault(path)
    if (!safe) return fail('Path is outside the vault')
    if (typeof content !== 'string') return fail('Invalid content')
    try {
      const outcome = writeVaultFile(safe, content, { detectConflict: true })
      if (outcome.conflictCopy) {
        tagsService.updateFile(outcome.conflictCopy)
        refreshTree()
      }
      if (outcome.changed) afterNoteChanged(safe, content, options?.caretOffset)
      return { ok: true, ...outcome }
    } catch (error) {
      return fail(messageOf(error))
    }
  })

  handle('file:create', async (_, path, content = '') => {
    const safe = safeInsideVault(path)
    if (!safe) return fail('Path is outside the vault')
    if (existsSync(safe)) return fail('A note with that name already exists')
    try {
      writeVaultFile(safe, content)
      afterNoteChanged(safe, content)
      refreshTree()
      return { ok: true }
    } catch (error) {
      return fail(messageOf(error))
    }
  })

  handle('file:delete', async (_, path) => {
    const safe = safeInsideVault(path)
    if (!safe) return fail('Path is outside the vault')
    if (safe === currentVault()) return fail('Cannot delete the vault itself')
    try {
      await trashPath(safe)
      tagsService.removePath(safe)
      historyService.onPathDeleted(safe)
      refreshTree()
      broadcastIndex()
      return { ok: true }
    } catch (error) {
      return fail(`Could not move to Trash: ${messageOf(error)}`)
    }
  })

  handle('file:rename', async (_, oldPath, newPath) => {
    const safeOld = safeInsideVault(oldPath)
    const safeNew = safeInsideVault(newPath)
    if (!safeOld || !safeNew) return fail('Path is outside the vault')
    if (safeOld === currentVault()) return fail('Cannot rename the vault itself')
    if (safeOld === safeNew) return { ok: true }
    if (existsSync(safeNew) && !sameInode(safeOld, safeNew)) {
      return fail('Something with that name already exists')
    }
    try {
      renameSync(safeOld, safeNew)
      tagsService.renamePath(safeOld, safeNew)
      historyService.onPathRenamed(safeOld, safeNew)
      movePath(safeOld, safeNew)
      refreshTree()
      broadcastIndex()
      return { ok: true }
    } catch (error) {
      return fail(messageOf(error))
    }
  })

  handle('folder:create', async (_, path) => {
    const safe = safeInsideVault(path)
    if (!safe) return fail('Path is outside the vault')
    if (existsSync(safe)) return fail('A folder with that name already exists')
    try {
      mkdirSync(safe, { recursive: true })
      refreshTree()
      return { ok: true }
    } catch (error) {
      return fail(messageOf(error))
    }
  })

  handle('folder:delete', async (_, path) => {
    const safe = safeInsideVault(path)
    if (!safe) return fail('Path is outside the vault')
    if (safe === currentVault()) return fail('Cannot delete the vault itself')
    try {
      await trashPath(safe)
      tagsService.removePath(safe)
      historyService.onPathDeleted(safe)
      forgetPath(safe)
      refreshTree()
      broadcastIndex()
      return { ok: true }
    } catch (error) {
      return fail(`Could not move to Trash: ${messageOf(error)}`)
    }
  })

  // --- Attachments and links -------------------------------------------

  handle('attachment:save', async (_, sourcePath) => {
    const vaultPath = currentVault()
    if (!vaultPath) return fail('No vault is open')
    if (typeof sourcePath !== 'string') return fail('Invalid source path')
    try {
      const saved = saveAttachment(vaultPath, sourcePath)
      refreshTree()
      return { ok: true, ...saved }
    } catch (error) {
      return fail(messageOf(error))
    }
  })

  handle('attachment:open', async (_, target) => {
    const vaultPath = currentVault()
    if (!vaultPath) return fail('No vault is open')
    if (typeof target !== 'string') return fail('Invalid path')
    // Vault-relative paths only: a crafted `[x](/Applications/Evil.app)`
    // must never resolve.
    if (target.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(target) || target.startsWith('\\\\')) {
      return fail('Only vault-relative links can be opened')
    }
    let decoded = target
    try {
      decoded = decodeURI(target)
    } catch {
      /* keep raw */
    }
    const safe = safeInsideVault(join(vaultPath, decoded))
    if (!safe || !existsSync(safe)) return fail('File not found in the vault')
    try {
      if (statSync(safe).isDirectory() || !OPENABLE_EXTENSIONS.has(extname(safe).toLowerCase())) {
        shell.showItemInFolder(safe)
        return { ok: true }
      }
      const errorMsg = await shell.openPath(safe)
      return errorMsg ? fail(errorMsg) : { ok: true }
    } catch (error) {
      return fail(messageOf(error))
    }
  })

  handle('shell:open-external', async (_, url) => {
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) return
    await shell.openExternal(url)
  })

  // --- Store ----------------------------------------------------------

  handle('store:get-state', async () => {
    const { settings, ui, fileTree } = mainStore.getState()
    return { settings, ui, fileTree }
  })

  handle('store:set-theme', async (_, theme) => {
    if (theme !== 'dark' && theme !== 'light') return
    mainStore.getState().setTheme(theme)
    broadcast('store:state-changed', { settings: { theme } })
  })

  handle('store:toggle-left-sidebar', async () => {
    mainStore.getState().toggleLeftSidebar()
    broadcast('store:state-changed', {
      ui: { leftSidebarVisible: mainStore.getState().ui.leftSidebarVisible }
    })
  })

  handle('store:toggle-right-sidebar', async () => {
    mainStore.getState().toggleRightSidebar()
    broadcast('store:state-changed', {
      ui: { rightSidebarVisible: mainStore.getState().ui.rightSidebarVisible }
    })
  })

  handle('store:set-sidebar-width', async (_, side, width) => {
    if ((side !== 'left' && side !== 'right') || !Number.isFinite(width)) return
    mainStore.getState().setSidebarWidth(side, Math.round(width))
    const { leftSidebarWidth, rightSidebarWidth } = mainStore.getState().ui
    broadcast('store:state-changed', { ui: { leftSidebarWidth, rightSidebarWidth } })
  })

  handle('store:set-font-size', async (_, size) => {
    mainStore.getState().setFontSize(size)
    broadcast('store:state-changed', { settings: { fontSize: size } })
  })

  handle('store:set-accent-color', async (_, color) => {
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return
    mainStore.getState().setAccentColor(color)
    broadcast('store:state-changed', { settings: { accentColor: color } })
  })

  handle('store:toggle-folder-expanded', async (_, folderId) => {
    mainStore.getState().toggleFolderExpanded(folderId)
    broadcast('store:state-changed', {
      ui: { expandedFolders: mainStore.getState().ui.expandedFolders }
    })
  })

  handle('store:toggle-relation-expanded', async (_, filePath, tag) => {
    mainStore.getState().toggleRelationExpanded(filePath, tag)
    broadcast('store:state-changed', {
      ui: { expandedRelations: mainStore.getState().ui.expandedRelations }
    })
  })

  handle('store:set-section-expanded', async (_, sectionId, expanded) => {
    mainStore.getState().setSectionExpanded(sectionId, Boolean(expanded))
    broadcast('store:state-changed', {
      ui: { sectionsExpanded: mainStore.getState().ui.sectionsExpanded }
    })
  })

  handle('store:set-section-order', async (_, order) => {
    if (!Array.isArray(order) || !order.every((id) => typeof id === 'string')) return
    mainStore.getState().setSectionOrder(order)
    broadcast('store:state-changed', { ui: { sectionOrder: mainStore.getState().ui.sectionOrder } })
  })

  handle('store:set-ai-model', async (_, model) => {
    mainStore.getState().setAIModel(model)
    broadcast('store:state-changed', { settings: { ai: mainStore.getState().settings.ai } })
  })

  handle('store:set-ai-system-prompt', async (_, prompt) => {
    if (typeof prompt !== 'string') return
    mainStore.getState().setAISystemPrompt(prompt)
    broadcast('store:state-changed', { settings: { ai: mainStore.getState().settings.ai } })
  })

  handle('store:set-last-opened-file', async (_, path) => {
    mainStore.getState().setLastOpenedFile(typeof path === 'string' ? path : null)
  })

  // --- Tags -----------------------------------------------------------

  handle('tags:get-index', async () => tagsService.getSnapshot())
  handle('tags:get-relations', async (_, filePath) => tagsService.getRelations(filePath))
  handle('tags:get-graph', async () => tagsService.getTagGraph())

  handle('tags:remove-tag', async (_, tag) => {
    if (typeof tag !== 'string') return { filesModified: [], occurrencesRemoved: 0 }
    const result = tagsService.removeTag(tag)
    if (result.filesModified.length > 0) {
      broadcastIndex()
      notifyRewrites(result.filesModified, 'tag-removal')
    }
    return result
  })

  // --- History --------------------------------------------------------

  handle('history:list', async (_, filePath) => {
    const safe = safeInsideVault(filePath)
    return safe ? historyService.list(safe) : { filePath, snapshots: [] }
  })

  handle('history:create-snapshot', async (_, filePath) => {
    const safe = safeInsideVault(filePath)
    if (!safe) return null
    const meta = historyService.createSnapshot(safe, 'manual')
    if (meta) broadcast('history:changed', { filePath: safe })
    return meta
  })

  handle('history:restore', async (_, filePath, snapshotId) => {
    const safe = safeInsideVault(filePath)
    if (!safe) return fail('Path is outside the vault')
    const content = historyService.readSnapshot(safe, snapshotId)
    if (content === null) return fail('Snapshot not found')
    try {
      historyService.createSnapshot(safe, 'auto')
      if (writeVaultFile(safe, content).changed) afterNoteChanged(safe, content)
      broadcast('history:changed', { filePath: safe })
      return { ok: true, content }
    } catch (error) {
      return fail(messageOf(error))
    }
  })

  handle('history:delete-snapshot', async (_, filePath, snapshotId) => {
    const safe = safeInsideVault(filePath)
    if (!safe) return fail('Path is outside the vault')
    if (!historyService.deleteSnapshot(safe, snapshotId)) return fail('Snapshot not found')
    broadcast('history:changed', { filePath: safe })
    return { ok: true }
  })

  // --- Search ---------------------------------------------------------

  handle('search:query', async (_, query, limit) =>
    tagsService.search(typeof query === 'string' ? query : '', Number(limit))
  )

  // --- AI (Ollama) ------------------------------------------------------

  handle('ai:list-models', async () => listModels())

  // In-flight streams so the user can cancel. Capped so a bug can never
  // fan out into hundreds of parallel requests.
  const activeChats = new Map<string, AbortController>()
  const MAX_CONCURRENT_CHATS = 5
  // Deltas are coalesced into ~40 ms batches: one IPC message and one
  // render per batch instead of one per token.
  const CHUNK_FLUSH_MS = 40

  handle('ai:chat-start', async (event, requestId, model, messages) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const reject = (message: string): void => sendTo(win, 'ai:chat-error', { requestId, message })
    if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 64) return
    if (typeof model !== 'string' || !Array.isArray(messages)) return reject('Invalid chat request')
    if (activeChats.has(requestId)) return reject('Duplicate chat request')
    if (activeChats.size >= MAX_CONCURRENT_CHATS) return reject('Too many concurrent chat requests')

    const controller = new AbortController()
    activeChats.set(requestId, controller)

    let pending = ''
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flush = (): void => {
      flushTimer = null
      if (!pending) return
      sendTo(win, 'ai:chat-chunk', { requestId, delta: pending })
      pending = ''
    }
    const finish = (): void => {
      if (flushTimer) clearTimeout(flushTimer)
      flush()
      activeChats.delete(requestId)
    }

    void streamChat(
      model,
      messages as ChatMessageSend[],
      controller.signal,
      (delta) => {
        pending += delta
        if (!flushTimer) flushTimer = setTimeout(flush, CHUNK_FLUSH_MS)
      },
      () => {
        finish()
        sendTo(win, 'ai:chat-done', { requestId })
      },
      (message) => {
        finish()
        reject(message)
      }
    )
  })

  handle('ai:chat-abort', async (_, requestId) => {
    const controller = activeChats.get(requestId)
    if (controller) {
      controller.abort()
      activeChats.delete(requestId)
    }
  })
}
