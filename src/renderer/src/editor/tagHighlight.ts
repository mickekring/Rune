import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { createTagRegex } from '@shared/tag-core'

// Highlights #tags using the same recognition rule as the main-process
// index. A `#` inside a heading, code, or a link destination is not a tag
// there either, so it is not highlighted here.
const SKIP_NODES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'URL',
  'Autolink',
  'Frontmatter'
])

const tagMark = Decoration.mark({ class: 'cm-tag' })

function isInsideSkipped(view: EditorView, pos: number): boolean {
  let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(view.state).resolveInner(
    pos,
    1
  )
  while (node) {
    if (SKIP_NODES.has(node.name)) return true
    node = node.parent
  }
  return false
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    const re = createTagRegex()
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      if (isInsideSkipped(view, start)) continue
      builder.add(start, end, tagMark)
    }
  }
  return builder.finish()
}

export const tagHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)
