import { describe, expect, it } from 'vitest'
import { baseName, isInsideDir, joinPath, noteTitle, parentDir, sanitizeName } from './paths'

describe('path helpers', () => {
  it('splits posix and windows paths', () => {
    expect(baseName('/a/b/c.md')).toBe('c.md')
    expect(baseName('C:\\notes\\c.md')).toBe('c.md')
    expect(parentDir('/a/b/c.md')).toBe('/a/b')
    expect(parentDir('/c.md')).toBe('/')
    expect(parentDir('c.md')).toBe('')
    expect(joinPath('/a/b', 'c.md')).toBe('/a/b/c.md')
    expect(joinPath('/a/b/', 'c.md')).toBe('/a/b/c.md')
    expect(noteTitle('/a/b/Note.MD')).toBe('Note')
  })

  it('isInsideDir requires a separator boundary', () => {
    expect(isInsideDir('/v/Work', '/v/Work/a.md')).toBe(true)
    expect(isInsideDir('/v/Work', '/v/Work')).toBe(true)
    expect(isInsideDir('/v/Work', '/v/Workshops/a.md')).toBe(false)
  })
})

describe('sanitizeName', () => {
  it('replaces separators, illegal characters, and control characters', () => {
    expect(sanitizeName('a/b:c*d?e"f<g>h|i\\j')).toBe('a-b-c-d-e-f-g-h-i-j')
    expect(sanitizeName('tab\there')).toBe('tab-here')
  })

  it('strips leading dots and trailing dots/spaces', () => {
    expect(sanitizeName('.hidden')).toBe('hidden')
    expect(sanitizeName('name. ')).toBe('name')
    expect(sanitizeName('  padded  ')).toBe('padded')
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(sanitizeName('...')).toBe('')
    expect(sanitizeName('   ')).toBe('')
  })
})
