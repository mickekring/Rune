import type { WriteOptions } from '@shared/ipc'
import type { ChatMessageSend } from '@shared/types/ai'
import type { FontSize, Theme } from '@shared/types/store'

// Thin, typed wrappers around the preload bridge. Plain functions, not
// hooks: nothing here closes over React state.

const invoke = <C extends Parameters<typeof window.api.invoke>[0]>(
  ...args: Parameters<typeof window.api.invoke<C>>
): ReturnType<typeof window.api.invoke<C>> => window.api.invoke(...args)

export const api = {
  selectVault: () => invoke('dialog:select-vault'),
  openVault: (path: string) => invoke('vault:open', path),

  readFile: (path: string) => invoke('file:read', path),
  writeFile: (path: string, content: string, options?: WriteOptions) =>
    invoke('file:write', path, content, options),
  createFile: (path: string, content?: string) => invoke('file:create', path, content),
  deleteFile: (path: string) => invoke('file:delete', path),
  renameFile: (oldPath: string, newPath: string) => invoke('file:rename', oldPath, newPath),
  createFolder: (path: string) => invoke('folder:create', path),
  deleteFolder: (path: string) => invoke('folder:delete', path),

  saveAttachment: (sourcePath: string) => invoke('attachment:save', sourcePath),
  openAttachment: (relativePath: string) => invoke('attachment:open', relativePath),
  openExternal: (url: string) => invoke('shell:open-external', url),

  setTheme: (theme: Theme) => invoke('store:set-theme', theme),
  toggleLeftSidebar: () => invoke('store:toggle-left-sidebar'),
  toggleRightSidebar: () => invoke('store:toggle-right-sidebar'),
  setSidebarWidth: (side: 'left' | 'right', width: number) =>
    invoke('store:set-sidebar-width', side, width),
  setFontSize: (size: FontSize) => invoke('store:set-font-size', size),
  setAccentColor: (color: string) => invoke('store:set-accent-color', color),
  toggleFolderExpanded: (folderId: string) => invoke('store:toggle-folder-expanded', folderId),
  toggleRelationExpanded: (filePath: string, tag: string) =>
    invoke('store:toggle-relation-expanded', filePath, tag),
  setSectionExpanded: (sectionId: string, expanded: boolean) =>
    invoke('store:set-section-expanded', sectionId, expanded),
  setSectionOrder: (order: string[]) => invoke('store:set-section-order', order),
  setAIModel: (model: string | null) => invoke('store:set-ai-model', model),
  setAISystemPrompt: (prompt: string) => invoke('store:set-ai-system-prompt', prompt),
  setLastOpenedFile: (path: string | null) => invoke('store:set-last-opened-file', path),

  getTagIndex: () => invoke('tags:get-index'),
  getRelations: (filePath: string) => invoke('tags:get-relations', filePath),
  getTagGraph: () => invoke('tags:get-graph'),
  removeTag: (tag: string) => invoke('tags:remove-tag', tag),

  listHistory: (filePath: string) => invoke('history:list', filePath),
  createSnapshot: (filePath: string) => invoke('history:create-snapshot', filePath),
  restoreSnapshot: (filePath: string, snapshotId: string) =>
    invoke('history:restore', filePath, snapshotId),
  deleteSnapshot: (filePath: string, snapshotId: string) =>
    invoke('history:delete-snapshot', filePath, snapshotId),

  search: (query: string, limit: number) => invoke('search:query', query, limit),

  listModels: () => invoke('ai:list-models'),
  chatStart: (requestId: string, model: string, messages: ChatMessageSend[]) =>
    invoke('ai:chat-start', requestId, model, messages),
  chatAbort: (requestId: string) => invoke('ai:chat-abort', requestId)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
