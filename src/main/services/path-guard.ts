import { existsSync, realpathSync } from 'fs'
import { basename, dirname, resolve, sep } from 'path'
import { mainStore } from '../store'

/**
 * Resolve `userPath` and confirm it lives inside `rootReal` (which must
 * itself already be a realpath). Symlinks are resolved, so a link that
 * points out of the vault is rejected. Targets that do not exist yet are
 * resolved through their nearest existing ancestor so writes can be
 * validated before they happen.
 *
 * Pure with respect to Electron: only the filesystem is consulted, which
 * keeps it unit-testable with a temp directory.
 */
export function resolveInsideRoot(userPath: string, rootReal: string): string | null {
  if (typeof userPath !== 'string' || userPath.length === 0 || userPath.includes('\0')) {
    return null
  }
  const absolute = resolve(userPath)
  let targetReal: string
  try {
    if (existsSync(absolute)) {
      targetReal = realpathSync(absolute)
    } else {
      const tail: string[] = []
      let cursor = absolute
      while (!existsSync(cursor)) {
        const parent = dirname(cursor)
        if (parent === cursor) return null
        tail.unshift(basename(cursor))
        cursor = parent
      }
      targetReal = resolve(realpathSync(cursor), ...tail)
    }
  } catch {
    return null
  }
  if (targetReal !== rootReal && !targetReal.startsWith(rootReal + sep)) return null
  return targetReal
}

/** The open vault's root (always a realpath once `vault:open` ran). */
export function currentVaultRoot(): string | null {
  return mainStore.getState().settings.vaultPath
}

/** Confine a renderer-supplied path to the open vault or throw. */
export function assertInsideVault(userPath: string): string {
  const root = currentVaultRoot()
  if (!root) throw new Error('No vault is open')
  const resolved = resolveInsideRoot(userPath, root)
  if (!resolved) throw new Error(`Path is outside the vault: ${userPath}`)
  return resolved
}

/** Same as `assertInsideVault` but returns null instead of throwing. */
export function safeInsideVault(userPath: string): string | null {
  try {
    return assertInsideVault(userPath)
  } catch {
    return null
  }
}

/**
 * Allowlist for URLs handed to `shell.openExternal`. Rejects file://,
 * javascript:, custom app schemes, smb://, etc. — all of which can be
 * abused to exfiltrate data or launch applications.
 */
export function isSafeExternalUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}
