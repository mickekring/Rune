// State shapes shared by the main-process store and the renderer mirror.

export type Theme = 'dark' | 'light'

export interface FileNode {
  /** Vault-relative path with `/` separators; stable across restarts. */
  id: string
  name: string
  /** Absolute path on disk. */
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
}

export type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface AISettings {
  // Selected Ollama model name (e.g. "llama3.1:latest"). null if the
  // user hasn't picked one yet or if Ollama isn't reachable.
  model: string | null
  // System prompt template. May contain the placeholder "{{document}}"
  // which is substituted with the current note's content at send time.
  systemPrompt: string
}

export interface AppSettings {
  vaultPath: string | null
  theme: Theme
  fontSize: FontSize
  accentColor: string
  ai: AISettings
}

export const fontSizeValues: Record<FontSize, number> = {
  xs: 13,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20
}

export const fontSizeLabels: Record<FontSize, string> = {
  xs: 'Extra Small',
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
  xl: 'Extra Large'
}

export interface UIState {
  leftSidebarVisible: boolean
  rightSidebarVisible: boolean
  leftSidebarWidth: number
  rightSidebarWidth: number
  /** Reopened on launch when it still exists. */
  lastOpenedFile: string | null
  expandedFolders: string[]
  // Per-file map of expanded relation tag names in the right sidebar.
  // Keyed by absolute file path; value is an array of tag display names
  // currently expanded for that file.
  expandedRelations: Record<string, string[]>
  // Global (not per-file) expand state of top-level right-sidebar
  // sections, keyed by section id. Absence of a key means the section
  // uses its own default.
  sectionsExpanded: Record<string, boolean>
  // User-chosen order of top-level right-sidebar sections. Unknown
  // section ids (e.g. sections added in a later version) are appended
  // to the end in their declaration order by the renderer.
  sectionOrder: string[]
}

/** What `store:get-state` returns and what the renderer mirrors. */
export interface StoreSnapshot {
  settings: AppSettings
  ui: UIState
  fileTree: FileNode[]
}

/** Partial update pushed from main via `store:state-changed`. */
export interface StateUpdate {
  settings?: Partial<AppSettings>
  ui?: Partial<UIState>
  fileTree?: FileNode[]
}

export interface DocumentStats {
  wordCount: number
  characterCount: number
  readingTimeMinutes: number
  paragraphs: number
  sentences: number
}

export const DEFAULT_AI_SYSTEM_PROMPT = `You are a thoughtful writing companion for the markdown document provided below. Be concise, reference specific passages when relevant, and match the document's existing voice and language. When the user asks about something not in the document, answer briefly from general knowledge but make it clear you're stepping outside the document.

---
{{document}}
---`

export const defaultAISettings: AISettings = {
  model: null,
  systemPrompt: DEFAULT_AI_SYSTEM_PROMPT
}

export const defaultSettings: AppSettings = {
  vaultPath: null,
  theme: 'dark',
  fontSize: 'md',
  accentColor: '#7c8cff',
  ai: defaultAISettings
}

export const defaultUIState: UIState = {
  leftSidebarVisible: true,
  rightSidebarVisible: true,
  leftSidebarWidth: 280,
  rightSidebarWidth: 280,
  lastOpenedFile: null,
  expandedFolders: [],
  expandedRelations: {},
  sectionsExpanded: {},
  sectionOrder: []
}
