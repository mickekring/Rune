import { describe, expect, it } from 'vitest'
import {
  findProtectedRanges,
  findTags,
  isInsideProtected,
  mentionPattern,
  wordBoundaryPattern
} from './tag-core'

const tagNames = (content: string): string[] => findTags(content).map((t) => t.display)

describe('findTags', () => {
  it('recognises unicode tags and rejects short, numeric, and glued tokens', () => {
    expect(tagNames('Se #Skola och #färg, men inte #000000 eller #a eller x#nope eller ##dup')).toEqual([
      'Skola',
      'färg'
    ])
  })

  it('does not treat ATX headings as tags', () => {
    expect(tagNames('# Heading\n## Sub\n#real')).toEqual(['real'])
  })

  it('reports the offset of the # and the exclusive end', () => {
    const [m] = findTags('abc #Tag def')
    expect(m.start).toBe(4)
    expect(m.end).toBe(8)
    expect(m.lower).toBe('tag')
  })

  it('skips tags inside frontmatter, code fences, inline code, links, and URLs', () => {
    const content = [
      '---',
      'tags: #front',
      '---',
      'Real #one here',
      '```css',
      '#main { color: red }',
      '```',
      'Inline `#code` and [link](#anchor) and https://x.com/#frag and <http://y.com/#z>',
      '#two'
    ].join('\n')
    expect(tagNames(content)).toEqual(['one', 'two'])
  })

  it('protects everything after an unclosed fence', () => {
    const content = 'before #keep\n```\n#include <x>\n#define Y'
    expect(tagNames(content)).toEqual(['keep'])
    const ranges = findProtectedRanges(content)
    expect(isInsideProtected(content.length - 1, ranges)).toBe(true)
  })

  it('handles tilde fences and indented fences', () => {
    expect(tagNames('~~~\n#hidden\n~~~\n  ```\n  #also\n  ```\n#shown')).toEqual(['shown'])
  })
})

describe('wordBoundaryPattern', () => {
  it('matches whole words case-insensitively but not already tagged or glued words', () => {
    const re = wordBoundaryPattern('nip')
    expect('the NIP project'.match(re)?.[0]).toBe('NIP')
    expect('snipping tools'.match(re)).toBeNull()
    expect('nips'.match(re)).toBeNull()
    expect('#nip already'.match(re)).toBeNull()
  })

  it('escapes regex metacharacters in the word', () => {
    expect('c++ rocks'.match(wordBoundaryPattern('c++'))?.[0]).toBe('c++')
  })
})

describe('mentionPattern', () => {
  it('is a whole-word, case-insensitive test', () => {
    const re = mentionPattern('skola')
    expect(re.test('I Skola idag')).toBe(true)
    expect(re.test('skolans')).toBe(false)
  })
})
