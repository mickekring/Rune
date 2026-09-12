import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  statSync,
  writeSync
} from 'fs'
import { basename, dirname, extname, join, sep } from 'path'
import type { WriteOutcome } from '@shared/ipc'

// Reads and writes of user notes, tuned for vaults that live inside a
// cloud-sync folder (pCloud, OneDrive, iCloud, Proton Drive, Dropbox,
// Syncthing …).
//
//   1) Writes are skipped when the content is unchanged — every no-op
//      write is a chance for a sync daemon to race the next real save
//      and produce a "conflicted copy".
//   2) fsync before close: FSEvents-driven daemons read the file the
//      moment they see a write event; fsync guarantees stable bytes.
//   3) No temp-file-plus-rename: iCloud rewrites inodes on rename and
//      pCloud treats it as delete+create. Direct overwrite behaves on
//      every service we target.
//   4) Change tracking: the mtime/size seen at the last read or write is
//      remembered per path. If a write finds the file changed underneath
//      it (another device, another app), the on-disk version is kept as
//      a conflict copy next to the note and the editor's content wins.

interface Known {
  mtimeMs: number
  size: number
}

const known = new Map<string, Known>()

function remember(path: string): void {
  try {
    const stats = statSync(path)
    known.set(path, { mtimeMs: stats.mtimeMs, size: stats.size })
  } catch {
    known.delete(path)
  }
}

function writeWithFsync(path: string, content: string): void {
  const buffer = Buffer.from(content, 'utf8')
  const fd = openSync(path, 'w')
  try {
    let offset = 0
    while (offset < buffer.length) {
      offset += writeSync(fd, buffer, offset, buffer.length - offset)
    }
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function conflictStamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}`
}

function writeConflictCopy(path: string, content: string): string {
  const dir = dirname(path)
  const ext = extname(path)
  const stem = basename(path, ext)
  const stamp = conflictStamp(new Date())
  let candidate = join(dir, `${stem} (conflict ${stamp})${ext}`)
  let n = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${stem} (conflict ${stamp} ${n})${ext}`)
    n += 1
  }
  writeWithFsync(candidate, content)
  remember(candidate)
  return candidate
}

/** Read a note and remember its on-disk state for conflict detection. */
export function readVaultFile(path: string): string {
  const content = readFileSync(path, 'utf-8')
  remember(path)
  return content
}

export interface WriteVaultOptions {
  /**
   * Compare the file's current mtime/size against what was seen at the
   * last read or write. Only editor saves opt in — internal rewrites
   * (propagation, tag removal) always operate on freshly indexed content.
   */
  detectConflict?: boolean
}

/**
 * Write a note. Skips the write when the on-disk content already matches.
 * With `detectConflict`, preserves an externally changed on-disk version
 * as a conflict copy before overwriting it.
 */
export function writeVaultFile(
  path: string,
  content: string,
  options: WriteVaultOptions = {}
): WriteOutcome {
  let conflictCopy: string | undefined

  if (existsSync(path)) {
    let current: string | null = null
    try {
      current = readFileSync(path, 'utf-8')
    } catch {
      // Unreadable: fall through and attempt the write — refusing to
      // save is worse than losing the no-op guarantee.
    }
    if (current !== null) {
      if (current === content) {
        remember(path)
        return { changed: false }
      }
      if (options.detectConflict) {
        const seen = known.get(path)
        if (seen) {
          const stats = statSync(path)
          if (stats.mtimeMs !== seen.mtimeMs || stats.size !== seen.size) {
            conflictCopy = writeConflictCopy(path, current)
          }
        }
      }
    }
  }

  writeWithFsync(path, content)
  remember(path)
  return conflictCopy ? { changed: true, conflictCopy } : { changed: true }
}

/** Unconditional fsync'd write for app-internal files (snapshots). */
export function writeInternalFile(path: string, content: string): void {
  writeWithFsync(path, content)
}

export function forgetPath(path: string): void {
  for (const key of [...known.keys()]) {
    if (key === path || key.startsWith(path + sep)) known.delete(key)
  }
}

/** Keep change tracking intact across a rename or move (file or folder). */
export function movePath(oldPath: string, newPath: string): void {
  for (const [key, value] of [...known.entries()]) {
    if (key === oldPath || key.startsWith(oldPath + sep)) {
      known.delete(key)
      known.set(newPath + key.slice(oldPath.length), value)
    }
  }
}
