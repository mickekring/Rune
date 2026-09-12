// The single IPC contract. The type maps are the source of truth; the
// runtime channel lists are checked against them at compile time, so a
// channel cannot exist in one place and not the other. The preload
// allowlist, the main-process `handle()` helper, and the renderer's
// `window.api` are all typed from this file.

import type { FileNode, FontSize, StateUpdate, StoreSnapshot, Theme } from './types/store'
import type { FileRelations, RemoveTagResult, TagGraph, TagIndexSnapshot } from './types/tags'
import type { FileHistory, SnapshotMeta } from './types/history'
import type { ChatChunk, ChatDone, ChatError, ChatMessageSend, OllamaModel } from './types/ai'
import type { SearchResults } from './types/search'

/** Uniform result for operations that can fail in a user-facing way. */
export type Ok<T = object> = { ok: true } & T
export type Err = { ok: false; error: string }
export type Result<T = object> = Ok<T> | Err

export interface WriteOptions {
  /**
   * Caret offset in the saved content. A tag whose text contains the
   * caret is assumed to still be being typed and is not propagated yet.
   */
  caretOffset?: number
}

export interface WriteOutcome {
  /** False when the on-disk content already matched (no-op write). */
  changed: boolean
  /**
   * Set when the file had been modified on disk (another device, another
   * app) since it was last read here. The on-disk version was preserved
   * at this path and the editor's content won.
   */
  conflictCopy?: string
}

export interface InvokeMap {
  'dialog:select-vault': { args: []; result: string | null }
  'vault:open': {
    args: [path: string]
    result: Result<{ fileTree: FileNode[]; vaultPath: string }>
  }

  'file:read': { args: [path: string]; result: Result<{ content: string }> }
  'file:write': {
    args: [path: string, content: string, options?: WriteOptions]
    result: Result<WriteOutcome>
  }
  'file:create': { args: [path: string, content?: string]; result: Result }
  'file:delete': { args: [path: string]; result: Result }
  'file:rename': { args: [oldPath: string, newPath: string]; result: Result }
  'folder:create': { args: [path: string]; result: Result }
  'folder:delete': { args: [path: string]; result: Result }

  'attachment:save': {
    args: [sourcePath: string]
    result: Result<{ filename: string; relativePath: string }>
  }
  'attachment:open': { args: [relativePath: string]; result: Result }
  'shell:open-external': { args: [url: string]; result: void }

  'store:get-state': { args: []; result: StoreSnapshot }
  'store:set-theme': { args: [theme: Theme]; result: void }
  'store:toggle-left-sidebar': { args: []; result: void }
  'store:toggle-right-sidebar': { args: []; result: void }
  'store:set-sidebar-width': { args: [side: 'left' | 'right', width: number]; result: void }
  'store:set-font-size': { args: [size: FontSize]; result: void }
  'store:set-accent-color': { args: [color: string]; result: void }
  'store:toggle-folder-expanded': { args: [folderId: string]; result: void }
  'store:toggle-relation-expanded': { args: [filePath: string, tag: string]; result: void }
  'store:set-section-expanded': { args: [sectionId: string, expanded: boolean]; result: void }
  'store:set-section-order': { args: [order: string[]]; result: void }
  'store:set-ai-model': { args: [model: string | null]; result: void }
  'store:set-ai-system-prompt': { args: [prompt: string]; result: void }
  'store:set-last-opened-file': { args: [path: string | null]; result: void }

  'tags:get-index': { args: []; result: TagIndexSnapshot }
  'tags:get-relations': { args: [filePath: string]; result: FileRelations }
  'tags:get-graph': { args: []; result: TagGraph }
  'tags:remove-tag': { args: [tag: string]; result: RemoveTagResult }

  'history:list': { args: [filePath: string]; result: FileHistory }
  'history:create-snapshot': { args: [filePath: string]; result: SnapshotMeta | null }
  'history:restore': {
    args: [filePath: string, snapshotId: string]
    result: Result<{ content: string }>
  }
  'history:delete-snapshot': { args: [filePath: string, snapshotId: string]; result: Result }

  'search:query': { args: [query: string, limit: number]; result: SearchResults }

  'ai:list-models': { args: []; result: Result<{ models: OllamaModel[] }> }
  'ai:chat-start': {
    args: [requestId: string, model: string, messages: ChatMessageSend[]]
    result: void
  }
  'ai:chat-abort': { args: [requestId: string]; result: void }
}

export type InvokeChannel = keyof InvokeMap
export type InvokeArgs<C extends InvokeChannel> = InvokeMap[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeMap[C]['result']

/** Events pushed from main to the renderer. */
export interface EventMap {
  'store:state-changed': StateUpdate
  /**
   * Main rewrote these vault files itself (tag propagation, tag removal).
   * The renderer reloads the open note if it is listed and not dirty.
   */
  'file:external-change': { paths: string[]; reason: 'propagation' | 'tag-removal' }
  /** The tag index mutated; consumers fetch what they need on demand. */
  'tags:index-changed': { version: number }
  'history:changed': { filePath: string }
  'ai:chat-chunk': ChatChunk
  'ai:chat-done': ChatDone
  'ai:chat-error': ChatError
}

export type EventChannel = keyof EventMap
export type EventData<C extends EventChannel> = EventMap[C]

// Runtime lists for the preload allowlist. `satisfies` makes both a
// missing and an extra key a compile error.
export const INVOKE_CHANNELS = Object.keys({
  'dialog:select-vault': 0,
  'vault:open': 0,
  'file:read': 0,
  'file:write': 0,
  'file:create': 0,
  'file:delete': 0,
  'file:rename': 0,
  'folder:create': 0,
  'folder:delete': 0,
  'attachment:save': 0,
  'attachment:open': 0,
  'shell:open-external': 0,
  'store:get-state': 0,
  'store:set-theme': 0,
  'store:toggle-left-sidebar': 0,
  'store:toggle-right-sidebar': 0,
  'store:set-sidebar-width': 0,
  'store:set-font-size': 0,
  'store:set-accent-color': 0,
  'store:toggle-folder-expanded': 0,
  'store:toggle-relation-expanded': 0,
  'store:set-section-expanded': 0,
  'store:set-section-order': 0,
  'store:set-ai-model': 0,
  'store:set-ai-system-prompt': 0,
  'store:set-last-opened-file': 0,
  'tags:get-index': 0,
  'tags:get-relations': 0,
  'tags:get-graph': 0,
  'tags:remove-tag': 0,
  'history:list': 0,
  'history:create-snapshot': 0,
  'history:restore': 0,
  'history:delete-snapshot': 0,
  'search:query': 0,
  'ai:list-models': 0,
  'ai:chat-start': 0,
  'ai:chat-abort': 0
} satisfies Record<InvokeChannel, 0>) as InvokeChannel[]

export const EVENT_CHANNELS = Object.keys({
  'store:state-changed': 0,
  'file:external-change': 0,
  'tags:index-changed': 0,
  'history:changed': 0,
  'ai:chat-chunk': 0,
  'ai:chat-done': 0,
  'ai:chat-error': 0
} satisfies Record<EventChannel, 0>) as EventChannel[]

/** The bridge exposed on `window.api` by the preload script. */
export interface RendererApi {
  invoke: <C extends InvokeChannel>(
    channel: C,
    ...args: InvokeArgs<C>
  ) => Promise<InvokeResult<C>>
  on: <C extends EventChannel>(
    channel: C,
    callback: (data: EventData<C>) => void
  ) => () => void
  /** Absolute path of a File dropped from the OS. */
  getFilePath: (file: File) => string
}
