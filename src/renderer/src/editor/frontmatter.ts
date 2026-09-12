import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Tags every line of the Frontmatter block (see frontmatterParser.ts) so
// CSS can render it as one muted metadata block with rounded corners.

const firstLine = Decoration.line({ class: 'cm-frontmatter cm-frontmatter-first' })
const middleLine = Decoration.line({ class: 'cm-frontmatter' })
const lastLine = Decoration.line({ class: 'cm-frontmatter cm-frontmatter-last' })
const onlyLine = Decoration.line({ class: 'cm-frontmatter cm-frontmatter-first cm-frontmatter-last' })

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const block = syntaxTree(view.state).topNode.getChild('Frontmatter')
  if (!block) return builder.finish()

  const doc = view.state.doc
  const first = doc.lineAt(block.from).number
  const last = doc.lineAt(block.to).number
  for (let n = first; n <= last; n += 1) {
    const line = doc.line(n)
    const deco =
      first === last ? onlyLine : n === first ? firstLine : n === last ? lastLine : middleLine
    builder.add(line.from, line.from, deco)
  }
  return builder.finish()
}

export const frontmatterBlock = ViewPlugin.fromClass(
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
