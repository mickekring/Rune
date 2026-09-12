import { styleTags, tags as t } from '@lezer/highlight'
import type { BlockContext, Line, MarkdownConfig } from '@lezer/markdown'

// YAML frontmatter as a block node. Without this the parser reads
//
//   ---
//   title: x
//   ---
//
// as a thematic break followed by a *setext heading* ("title: x" underlined
// with ---), so every note that starts with metadata opened with a giant
// heading. Only a `---` on the very first line opens frontmatter, and it
// must be closed by another `---` line; an unclosed one stays a thematic
// break. Pure lezer code: no DOM, unit-tested directly.

const FENCE = /^---\s*$/
// Frontmatter this far into a document is not frontmatter.
const SCAN_LIMIT = 20_000

interface ReadableInput {
  length: number
  read(from: number, to: number): string
}

function parseFrontmatter(cx: BlockContext, line: Line): boolean {
  if (cx.lineStart !== 0 || !FENCE.test(line.text)) return false
  // The block context does not expose the input in its public type, but
  // scanning it is the only way to find the closing fence without
  // consuming lines that turn out not to be frontmatter.
  const input = (cx as unknown as { input?: ReadableInput }).input
  if (!input) return false

  const lines = input.read(0, Math.min(input.length, SCAN_LIMIT)).split('\n')
  let closing = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (FENCE.test(lines[i])) {
      closing = i
      break
    }
  }
  if (closing < 0) return false

  for (let i = 0; i < closing; i += 1) {
    if (!cx.nextLine()) return false
  }
  const end = cx.lineStart + line.text.length
  const marks = [
    cx.elt('FrontmatterMark', 0, 3),
    cx.elt('FrontmatterMark', cx.lineStart, cx.lineStart + 3)
  ]
  cx.addElement(cx.elt('Frontmatter', 0, end, marks))
  cx.nextLine()
  return true
}

export const frontmatter: MarkdownConfig = {
  defineNodes: [{ name: 'Frontmatter', block: true }, { name: 'FrontmatterMark' }],
  props: [styleTags({ Frontmatter: t.documentMeta, FrontmatterMark: t.processingInstruction })],
  parseBlock: [{ name: 'Frontmatter', before: 'HorizontalRule', parse: parseFrontmatter }]
}
