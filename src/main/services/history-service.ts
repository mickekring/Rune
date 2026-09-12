import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync
} from 'fs'
import { dirname, isAbsolute, join, relative } from 'path'
import { APP_DIR_NAME } from '@shared/constants'
import {
  HISTORY_MAX_SNAPSHOTS,
  type FileHistory,
  type SnapshotKind,
  type SnapshotMeta
} from '@shared/types/history'
import { writeInternalFile } from './vault-files'

// Snapshots live at {vault}/.rune/history/{relative-path}/{id}.md.
// `manual` and `auto` snapshots share the folder but are pruned as two
// independent rings of HISTORY_MAX_SNAPSHOTS each.

const HISTORY_SUBDIR = 'history'
const SNAPSHOT_ID_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(-auto)?$/

let vaultPath: string | null = null

export function isValidSnapshotId(id: unknown): id is string {
  return typeof id === 'string' && SNAPSHOT_ID_RE.test(id)
}

export function parseSnapshotId(id: string): { timestamp: number; kind: SnapshotKind } | null {
  const match = SNAPSHOT_ID_RE.exec(id)
  if (!match) return null
  const [, y, mo, d, h, mi, s, ms, autoSuffix] = match
  return {
    timestamp: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms),
    kind: autoSuffix ? 'auto' : 'manual'
  }
}

export function formatSnapshotId(timestamp: number, kind: SnapshotKind): string {
  const base = new Date(timestamp).toISOString().replace(/[:.]/g, '-')
  return kind === 'auto' ? `${base}-auto` : base
}

function historyRoot(): string | null {
  return vaultPath ? join(vaultPath, APP_DIR_NAME, HISTORY_SUBDIR) : null
}

// Mirror directory for a vault path: `/vault/Projekt/NIP.md` →
// `/vault/.rune/history/Projekt/NIP.md`. Null for anything that is not
// strictly inside the vault.
function historyDirFor(filePath: string): string | null {
  const root = historyRoot()
  if (!root || !vaultPath) return null
  const rel = relative(vaultPath, filePath)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return join(root, rel)
}

function listSnapshots(dir: string): SnapshotMeta[] {
  if (!existsSync(dir)) return []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out: SnapshotMeta[] = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const id = name.slice(0, -3)
    const parsed = parseSnapshotId(id)
    if (!parsed) continue
    let size = 0
    try {
      size = statSync(join(dir, name)).size
    } catch {
      /* ignore */
    }
    out.push({ id, kind: parsed.kind, timestamp: parsed.timestamp, size })
  }
  out.sort((a, b) => b.timestamp - a.timestamp)
  return out
}

function removeEmptyDirsUpTo(start: string, stopAt: string): void {
  let cur = start
  while (cur !== stopAt && cur.length > stopAt.length) {
    try {
      if (readdirSync(cur).length > 0) break
      rmdirSync(cur)
      cur = dirname(cur)
    } catch {
      break
    }
  }
}

export const historyService = {
  setVaultPath(path: string | null): void {
    vaultPath = path
  },

  /**
   * Snapshot the file's current on-disk content. Automatic snapshots are
   * skipped when the newest existing snapshot already holds the same
   * content, so repeated rewrites never fill the ring with duplicates.
   */
  createSnapshot(filePath: string, kind: SnapshotKind = 'manual'): SnapshotMeta | null {
    const dir = historyDirFor(filePath)
    if (!dir || !existsSync(filePath)) return null

    try {
      const content = readFileSync(filePath, 'utf-8')
      const existing = listSnapshots(dir)
      if (kind === 'auto' && existing.length > 0) {
        try {
          const newest = readFileSync(join(dir, `${existing[0].id}.md`), 'utf-8')
          if (newest === content) return null
        } catch {
          /* fall through and snapshot */
        }
      }

      mkdirSync(dir, { recursive: true })
      let timestamp = Date.now()
      let id = formatSnapshotId(timestamp, kind)
      while (existsSync(join(dir, `${id}.md`))) {
        timestamp += 1
        id = formatSnapshotId(timestamp, kind)
      }
      const snapshotPath = join(dir, `${id}.md`)
      writeInternalFile(snapshotPath, content)

      const sameKind = listSnapshots(dir).filter((s) => s.kind === kind)
      for (const old of sameKind.slice(HISTORY_MAX_SNAPSHOTS)) {
        try {
          unlinkSync(join(dir, `${old.id}.md`))
        } catch {
          /* best-effort */
        }
      }

      return { id, kind, timestamp, size: statSync(snapshotPath).size }
    } catch (error) {
      console.error(`history: failed to snapshot ${filePath}`, error)
      return null
    }
  },

  list(filePath: string): FileHistory {
    const dir = historyDirFor(filePath)
    return { filePath, snapshots: dir ? listSnapshots(dir) : [] }
  },

  /** Content of one snapshot, or null when the id is invalid or missing. */
  readSnapshot(filePath: string, snapshotId: string): string | null {
    if (!isValidSnapshotId(snapshotId)) return null
    const dir = historyDirFor(filePath)
    if (!dir) return null
    try {
      return readFileSync(join(dir, `${snapshotId}.md`), 'utf-8')
    } catch {
      return null
    }
  },

  deleteSnapshot(filePath: string, snapshotId: string): boolean {
    if (!isValidSnapshotId(snapshotId)) return false
    const dir = historyDirFor(filePath)
    const root = historyRoot()
    if (!dir || !root) return false
    const snapshotPath = join(dir, `${snapshotId}.md`)
    if (!existsSync(snapshotPath)) return false
    try {
      unlinkSync(snapshotPath)
      removeEmptyDirsUpTo(dir, root)
      return true
    } catch {
      return false
    }
  },

  /** Keep snapshots attached to a note (or folder of notes) across renames. */
  onPathRenamed(oldPath: string, newPath: string): void {
    const from = historyDirFor(oldPath)
    const to = historyDirFor(newPath)
    if (!from || !to || !existsSync(from)) return
    try {
      mkdirSync(dirname(to), { recursive: true })
      renameSync(from, to)
    } catch (error) {
      console.error(`history: failed to move snapshots ${from} -> ${to}`, error)
    }
  },

  /** Drop snapshots of a deleted note or folder so orphans never pile up. */
  onPathDeleted(path: string): void {
    const dir = historyDirFor(path)
    const root = historyRoot()
    if (!dir || !root || !existsSync(dir)) return
    try {
      rmSync(dir, { recursive: true, force: true })
      removeEmptyDirsUpTo(dirname(dir), root)
    } catch (error) {
      console.error(`history: failed to remove snapshots for ${path}`, error)
    }
  }
}
