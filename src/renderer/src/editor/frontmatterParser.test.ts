import { describe, expect, it } from 'vitest'
import { parser } from '@lezer/markdown'
import { frontmatter } from './frontmatterParser'

const md = parser.configure(frontmatter)

function nodeNames(doc: string): string[] {
  const names: string[] = []
  md.parse(doc).iterate({
    enter(node) {
      names.push(`${node.name}@${node.from}-${node.to}`)
    }
  })
  return names
}

describe('frontmatter block parser', () => {
  it('turns a leading --- block into a Frontmatter node instead of a setext heading', () => {
    const doc = '---\ntitle: Render\ncreated: 2026\n---\n\n# Heading\n\nBody'
    const names = nodeNames(doc)
    expect(names).toContain('Frontmatter@0-35')
    expect(names).toContain('FrontmatterMark@0-3')
    expect(names).toContain('FrontmatterMark@32-35')
    expect(names.some((n) => n.startsWith('SetextHeading'))).toBe(false)
    expect(names.some((n) => n.startsWith('ATXHeading1@37'))).toBe(true)
  })

  it('leaves an unclosed leading --- as a thematic break', () => {
    const names = nodeNames('---\n\nSome text\n\nmore')
    expect(names.some((n) => n.startsWith('Frontmatter'))).toBe(false)
    expect(names.some((n) => n.startsWith('HorizontalRule@0'))).toBe(true)
    expect(names.some((n) => n.startsWith('Paragraph'))).toBe(true)
  })

  it('does not treat --- blocks later in the document as frontmatter', () => {
    const names = nodeNames('Intro\n\n---\nkey: value\n---\n')
    expect(names.some((n) => n.startsWith('Frontmatter'))).toBe(false)
  })

  it('tolerates trailing spaces on the fences and does not parse the body as markdown', () => {
    const names = nodeNames('---  \ntags: #not-a-heading\n# still meta\n---\ntext')
    expect(names.some((n) => n.startsWith('Frontmatter@0'))).toBe(true)
    expect(names.some((n) => n.startsWith('ATXHeading'))).toBe(false)
    expect(names.some((n) => n.startsWith('Paragraph@'))).toBe(true)
  })
})
