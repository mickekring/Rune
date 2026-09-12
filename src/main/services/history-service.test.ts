import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { HISTORY_MAX_SNAPSHOTS } from '@shared/types/history'
import { formatSnapshotId, historyService, isValidSnapshotId, parseSnapshotId } from './history-service'

let vault: string
let note: string

beforeEach(() => {
  vault = realpathSync(mkdtempSync(join(tmpdir(), 'rune-history-')))
  mkdirSync(join(vault, 'Projects'))
  note = join(vault, 'Projects', 'note.md')
  writeFileSync(note, 'v1')
  historyService.setVaultPath(vault)
})

describe('snapshot ids', () => {
  it('round-trips manual and auto ids', () => {
    const ts = Date.UTC(2026, 3, 18, 14, 23, 56, 123)
    expect(formatSnapshotId(ts, 'manual')).toBe('2026-04-18T14-23-56-123Z')
    expect(formatSnapshotId(ts, 'auto')).toBe('2026-04-18T14-23-56-123Z-auto')
    expect(parseSnapshotId('2026-04-18T14-23-56-123Z-auto')).toEqual({ timestamp: ts, kind: 'auto' })
  })

  it('rejects anything that is not a bare timestamp id', () => {
    expect(isValidSnapshotId('../../etc/passwd')).toBe(false)
    expect(isValidSnapshotId('2026-04-18T14-23-56-123Z/../x')).toBe(false)
    expect(isValidSnapshotId(42)).toBe(false)
    expect(isValidSnapshotId('2026-04-18T14-23-56-123Z')).toBe(true)
  })
})

describe('historyService', () => {
  it('creates, lists, reads, and deletes snapshots', () => {
    const meta = historyService.createSnapshot(note, 'manual')
    expect(meta?.kind).toBe('manual')
    expect(historyService.list(note).snapshots.map((s) => s.id)).toEqual([meta!.id])
    expect(historyService.readSnapshot(note, meta!.id)).toBe('v1')
    expect(historyService.readSnapshot(note, '../../note')).toBeNull()
    expect(historyService.deleteSnapshot(note, '../x')).toBe(false)
    expect(historyService.deleteSnapshot(note, meta!.id)).toBe(true)
    expect(historyService.list(note).snapshots).toHaveLength(0)
  })

  it('skips automatic snapshots whose content already matches the newest one', () => {
    expect(historyService.createSnapshot(note, 'auto')).not.toBeNull()
    expect(historyService.createSnapshot(note, 'auto')).toBeNull()
    writeFileSync(note, 'v2')
    expect(historyService.createSnapshot(note, 'auto')).not.toBeNull()
    expect(historyService.list(note).snapshots).toHaveLength(2)
  })

  it('prunes manual and automatic snapshots as separate rings', () => {
    for (let i = 0; i < HISTORY_MAX_SNAPSHOTS + 3; i += 1) {
      writeFileSync(note, `manual ${i}`)
      expect(historyService.createSnapshot(note, 'manual')).not.toBeNull()
    }
    for (let i = 0; i < 4; i += 1) {
      writeFileSync(note, `auto ${i}`)
      expect(historyService.createSnapshot(note, 'auto')).not.toBeNull()
    }
    const snapshots = historyService.list(note).snapshots
    expect(snapshots.filter((s) => s.kind === 'manual')).toHaveLength(HISTORY_MAX_SNAPSHOTS)
    expect(snapshots.filter((s) => s.kind === 'auto')).toHaveLength(4)
  })

  it('refuses paths outside the vault', () => {
    expect(historyService.createSnapshot(join(vault, '..', 'other.md'), 'manual')).toBeNull()
    expect(historyService.list('/etc/hosts').snapshots).toHaveLength(0)
  })

  it('follows renames and cleans up after deletes', () => {
    const meta = historyService.createSnapshot(note, 'manual')!
    const renamed = join(vault, 'Projects', 'renamed.md')
    historyService.onPathRenamed(note, renamed)
    expect(historyService.list(renamed).snapshots.map((s) => s.id)).toEqual([meta.id])
    historyService.onPathDeleted(join(vault, 'Projects'))
    expect(existsSync(join(vault, '.rune', 'history', 'Projects'))).toBe(false)
  })
})
