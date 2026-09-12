import { create } from 'zustand'
import type { AppSettings, DocumentStats, FileNode, StateUpdate, UIState } from '@shared/types/store'
import { defaultSettings, defaultUIState } from '@shared/types/store'

// The renderer's single store. `settings`, `ui` and `fileTree` mirror the
// authoritative main-process store (hydrated once, then patched by
// `store:state-changed`). `editor` is renderer-local status that the
// status bar and right sidebar subscribe to, so the App component never
// re-renders per keystroke.

export interface EditorNotice {
  kind: 'error' | 'info'
  text: string
}

export interface EditorStatus {
  currentFile: string | null
  isDirty: boolean
  isSaving: boolean
  cursorLine: number
  cursorColumn: number
  stats: DocumentStats | null
  notice: EditorNotice | null
}

interface AppState {
  hydrated: boolean
  settings: AppSettings
  ui: UIState
  fileTree: FileNode[]
  editor: EditorStatus
  applyUpdate: (update: StateUpdate) => void
  setEditor: (patch: Partial<EditorStatus>) => void
}

const initialEditor: EditorStatus = {
  currentFile: null,
  isDirty: false,
  isSaving: false,
  cursorLine: 1,
  cursorColumn: 1,
  stats: null,
  notice: null
}

export const useAppStore = create<AppState>()((set) => ({
  hydrated: false,
  settings: defaultSettings,
  ui: defaultUIState,
  fileTree: [],
  editor: initialEditor,

  applyUpdate: (update) =>
    set((state) => ({
      settings: update.settings ? { ...state.settings, ...update.settings } : state.settings,
      ui: update.ui ? { ...state.ui, ...update.ui } : state.ui,
      fileTree: update.fileTree ?? state.fileTree
    })),

  setEditor: (patch) => set((state) => ({ editor: { ...state.editor, ...patch } }))
}))

let hydration: Promise<void> | null = null

/** Fetch the main-process snapshot once and keep the mirror in sync. */
export function hydrateStore(): Promise<void> {
  if (hydration) return hydration
  hydration = (async () => {
    // Subscribe before fetching so no update is lost in between.
    window.api.on('store:state-changed', (update) => {
      useAppStore.getState().applyUpdate(update)
    })
    try {
      const snapshot = await window.api.invoke('store:get-state')
      useAppStore.setState({ ...snapshot, hydrated: true })
    } catch (error) {
      console.error('Failed to load store state:', error)
      useAppStore.setState({ hydrated: true })
    }
  })()
  return hydration
}

let noticeTimer: ReturnType<typeof setTimeout> | undefined

/** Show a status-bar notice. Info notices fade after a few seconds. */
export function showNotice(kind: EditorNotice['kind'], text: string): void {
  if (noticeTimer) clearTimeout(noticeTimer)
  useAppStore.getState().setEditor({ notice: { kind, text } })
  if (kind === 'info') {
    noticeTimer = setTimeout(() => {
      const current = useAppStore.getState().editor.notice
      if (current?.text === text) useAppStore.getState().setEditor({ notice: null })
    }, 6000)
  }
}

export function clearNotice(): void {
  if (noticeTimer) clearTimeout(noticeTimer)
  if (useAppStore.getState().editor.notice) useAppStore.getState().setEditor({ notice: null })
}
