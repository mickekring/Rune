import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { APP_DIR_NAME } from '@shared/constants'
import {
  defaultSettings,
  defaultUIState,
  type AppSettings,
  type UIState
} from '@shared/types/store'

// Persistence for ~/.rune/{settings,ui-state,window-state}.json.
// Writes go through a sibling temp file plus rename so a crash mid-write
// can never leave a truncated file behind (the cloud-sync reasons for
// avoiding rename in the vault do not apply to the home directory).

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

const defaultWindowBounds: WindowBounds = { width: 1400, height: 900 }

let configDir: string | null = null

// RUNE_CONFIG_DIR overrides ~/.rune so a second profile (tests, a trial
// vault) can run without touching the real settings.
function getConfigDir(): string {
  if (!configDir) {
    configDir = process.env['RUNE_CONFIG_DIR'] || join(app.getPath('home'), APP_DIR_NAME)
  }
  return configDir
}

function ensureConfigDir(): void {
  const dir = getConfigDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
}

function fileIn(name: string): string {
  return join(getConfigDir(), name)
}

function readObject(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    console.error(`Ignoring malformed ${path}`)
  } catch (error) {
    console.error(`Error reading ${path}:`, error)
  }
  return null
}

function writeJSON(path: string, data: unknown): void {
  try {
    ensureConfigDir()
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 })
    renameSync(tmp, path)
  } catch (error) {
    console.error(`Error writing ${path}:`, error)
  }
}

export const settingsService = {
  loadSettings(): AppSettings {
    ensureConfigDir()
    const parsed = readObject(fileIn('settings.json'))
    if (!parsed) return defaultSettings
    const ai =
      parsed.ai && typeof parsed.ai === 'object'
        ? { ...defaultSettings.ai, ...(parsed.ai as object) }
        : defaultSettings.ai
    return { ...defaultSettings, ...parsed, ai } as AppSettings
  },

  saveSettings(settings: AppSettings): void {
    writeJSON(fileIn('settings.json'), settings)
  },

  loadUIState(): UIState {
    ensureConfigDir()
    const parsed = readObject(fileIn('ui-state.json'))
    return parsed ? ({ ...defaultUIState, ...parsed } as UIState) : defaultUIState
  },

  saveUIState(state: UIState): void {
    writeJSON(fileIn('ui-state.json'), state)
  },

  loadWindowBounds(): WindowBounds {
    ensureConfigDir()
    const parsed = readObject(fileIn('window-state.json'))
    return parsed ? ({ ...defaultWindowBounds, ...parsed } as WindowBounds) : defaultWindowBounds
  },

  saveWindowBounds(bounds: WindowBounds): void {
    writeJSON(fileIn('window-state.json'), bounds)
  }
}
