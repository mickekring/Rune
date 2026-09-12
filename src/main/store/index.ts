import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  AppSettings,
  FileNode,
  FontSize,
  Theme,
  UIState
} from '@shared/types/store'
import { settingsService } from '../services/settings-service'

// The authoritative store. Settings and UI state are persisted to
// ~/.rune/ on every change; the file tree is rebuilt from disk.
// Editor content never lives here — the renderer owns its buffer.

export interface MainStore {
  settings: AppSettings
  ui: UIState
  fileTree: FileNode[]

  setVaultPath: (path: string | null) => void
  setTheme: (theme: Theme) => void
  setFontSize: (size: FontSize) => void
  setAccentColor: (color: string) => void
  setAIModel: (model: string | null) => void
  setAISystemPrompt: (prompt: string) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setSidebarWidth: (side: 'left' | 'right', width: number) => void
  toggleFolderExpanded: (folderId: string) => void
  toggleRelationExpanded: (filePath: string, tag: string) => void
  setSectionExpanded: (sectionId: string, expanded: boolean) => void
  setSectionOrder: (order: string[]) => void
  setLastOpenedFile: (path: string | null) => void
  setFileTree: (tree: FileNode[]) => void
}

let store: StoreApi<MainStore> | null = null

function createMainStore(): StoreApi<MainStore> {
  return createStore<MainStore>()((set, get) => {
    const patchSettings = (patch: Partial<AppSettings>): void => {
      set((state) => ({ settings: { ...state.settings, ...patch } }))
      settingsService.saveSettings(get().settings)
    }
    const patchUI = (patch: Partial<UIState>): void => {
      set((state) => ({ ui: { ...state.ui, ...patch } }))
      settingsService.saveUIState(get().ui)
    }

    return {
      settings: settingsService.loadSettings(),
      ui: settingsService.loadUIState(),
      fileTree: [],

      setVaultPath: (path) => patchSettings({ vaultPath: path }),
      setTheme: (theme) => patchSettings({ theme }),
      setFontSize: (fontSize) => patchSettings({ fontSize }),
      setAccentColor: (accentColor) => patchSettings({ accentColor }),
      setAIModel: (model) => patchSettings({ ai: { ...get().settings.ai, model } }),
      setAISystemPrompt: (systemPrompt) =>
        patchSettings({ ai: { ...get().settings.ai, systemPrompt } }),

      toggleLeftSidebar: () => patchUI({ leftSidebarVisible: !get().ui.leftSidebarVisible }),
      toggleRightSidebar: () => patchUI({ rightSidebarVisible: !get().ui.rightSidebarVisible }),
      setSidebarWidth: (side, width) =>
        patchUI(side === 'left' ? { leftSidebarWidth: width } : { rightSidebarWidth: width }),

      toggleFolderExpanded: (folderId) => {
        const current = get().ui.expandedFolders
        patchUI({
          expandedFolders: current.includes(folderId)
            ? current.filter((id) => id !== folderId)
            : [...current, folderId]
        })
      },

      toggleRelationExpanded: (filePath, tag) => {
        const current = get().ui.expandedRelations ?? {}
        const existing = current[filePath] ?? []
        const nextForFile = existing.includes(tag)
          ? existing.filter((t) => t !== tag)
          : [...existing, tag]
        const next = { ...current }
        if (nextForFile.length === 0) delete next[filePath]
        else next[filePath] = nextForFile
        patchUI({ expandedRelations: next })
      },

      setSectionExpanded: (sectionId, expanded) =>
        patchUI({ sectionsExpanded: { ...(get().ui.sectionsExpanded ?? {}), [sectionId]: expanded } }),
      setSectionOrder: (sectionOrder) => patchUI({ sectionOrder }),
      setLastOpenedFile: (lastOpenedFile) => patchUI({ lastOpenedFile }),

      setFileTree: (fileTree) => set({ fileTree })
    }
  })
}

/** Lazily created so settings are read only once Electron is ready. */
export const mainStore = {
  getState(): MainStore {
    if (!store) store = createMainStore()
    return store.getState()
  }
}
