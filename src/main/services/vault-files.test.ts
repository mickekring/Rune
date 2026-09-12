import { existsSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { movePath, readVaultFile, writeVaultFile } from './vault-files'

let dir: string
let note: string

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'rune-files-')))
  note = join(dir, 'note.md')
})

describe('writeVaultFile', () => {
  it('writes new files and skips writes when content is unchanged', () => {
    expect(writeVaultFile(note, 'hello')).toEqual({ changed: true })
    expect(readFileSync(note, 'utf8')).toBe('hello')
    expect(writeVaultFile(note, 'hello')).toEqual({ changed: false })
    expect(writeVaultFile(note, 'hello2')).toEqual({ changed: true })
  })

  it('keeps an externally changed version as a conflict copy when asked to detect conflicts', () => {
    writeVaultFile(note, 'v1')
    readVaultFile(note)
    writeFileSync(note, 'changed elsewhere')
    const outcome = writeVaultFile(note, 'editor version', { detectConflict: true })
    expect(outcome.changed).toBe(true)
    expect(outcome.conflictCopy).toBeDefined()
    expect(readFileSync(outcome.conflictCopy!, 'utf8')).toBe('changed elsewhere')
    expect(readFileSync(note, 'utf8')).toBe('editor version')
    expect(outcome.conflictCopy!.startsWith(join(dir, 'note (conflict '))).toBe(true)
  })

  it('does not create conflict copies for internal rewrites or when the file was never read', () => {
    writeFileSync(note, 'unknown origin')
    expect(writeVaultFile(note, 'new', { detectConflict: true }).conflictCopy).toBeUndefined()
    readVaultFile(note)
    writeFileSync(note, 'changed elsewhere')
    expect(writeVaultFile(note, 'internal').conflictCopy).toBeUndefined()
  })

  it('carries change tracking across a move', () => {
    writeVaultFile(note, 'v1')
    const moved = join(dir, 'moved.md')
    renameSync(note, moved)
    movePath(note, moved)
    writeFileSync(moved, 'changed elsewhere')
    const outcome = writeVaultFile(moved, 'editor version', { detectConflict: true })
    expect(outcome.conflictCopy).toBeDefined()
    expect(existsSync(outcome.conflictCopy!)).toBe(true)
  })
})
