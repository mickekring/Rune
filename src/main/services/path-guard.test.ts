import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// path-guard reaches the main store for the vault root; the store reads
// settings through Electron, which is not available in a unit test.
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

import { isSafeExternalUrl, resolveInsideRoot } from './path-guard'

let root: string
let vault: string

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'rune-guard-')))
  vault = join(root, 'vault')
  mkdirSync(join(vault, 'sub'), { recursive: true })
  mkdirSync(join(root, 'vault2'))
  writeFileSync(join(vault, 'note.md'), 'x')
  writeFileSync(join(root, 'outside.md'), 'secret')
  symlinkSync(join(root, 'outside.md'), join(vault, 'leak.md'))
  symlinkSync(join(vault, 'note.md'), join(vault, 'inner-link.md'))
})

describe('resolveInsideRoot', () => {
  it('accepts paths inside the vault and the root itself', () => {
    expect(resolveInsideRoot(join(vault, 'note.md'), vault)).toBe(join(vault, 'note.md'))
    expect(resolveInsideRoot(vault, vault)).toBe(vault)
  })

  it('rejects traversal, siblings sharing a prefix, and absolute paths elsewhere', () => {
    expect(resolveInsideRoot(join(vault, '..', 'outside.md'), vault)).toBeNull()
    expect(resolveInsideRoot(join(root, 'vault2', 'x.md'), vault)).toBeNull()
    expect(resolveInsideRoot('/etc/hosts', vault)).toBeNull()
  })

  it('follows symlinks and rejects ones that leave the vault', () => {
    expect(resolveInsideRoot(join(vault, 'leak.md'), vault)).toBeNull()
    expect(resolveInsideRoot(join(vault, 'inner-link.md'), vault)).toBe(join(vault, 'note.md'))
  })

  it('validates paths that do not exist yet through their nearest ancestor', () => {
    expect(resolveInsideRoot(join(vault, 'new', 'deep', 'file.md'), vault)).toBe(
      join(vault, 'new', 'deep', 'file.md')
    )
    expect(resolveInsideRoot(join(vault, 'sub', '..', '..', 'new.md'), vault)).toBeNull()
  })

  it('rejects empty paths and embedded null bytes', () => {
    expect(resolveInsideRoot('', vault)).toBeNull()
    expect(resolveInsideRoot(join(vault, 'a\0b.md'), vault)).toBeNull()
  })
})

describe('isSafeExternalUrl', () => {
  it('allows only http, https, and mailto', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true)
    expect(isSafeExternalUrl('mailto:a@b.c')).toBe(true)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })
})
