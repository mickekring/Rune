import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Obsidian-style live preview: formatting marks (`#`, `**`, `_`, backticks,
// link syntax) disappear on lines the caret is not on and come back when
// the caret enters the construct.

const hideMark = Decoration.replace({})

const MARK_NODES = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'LinkMark',
  'StrikethroughMark',
  'LinkTitle'
])

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const state = view.state
  const sel = state.selection.main

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        let shouldHide = MARK_NODES.has(node.name)
        if (!shouldHide && node.name === 'URL' && node.node.parent?.name === 'Link') {
          shouldHide = true
        }
        if (!shouldHide) return

        const parent = node.node.parent
        if (!parent) return
        // Keep the raw syntax visible while the caret is inside it.
        if (sel.from <= parent.to && sel.to >= parent.from) return

        let end = node.to
        // The space after an ATX heading's `#` is not part of the mark
        // node. Hide it as well so the heading text sits flush with the
        // body text instead of one space in.
        if (node.name === 'HeaderMark' && parent.name.startsWith('ATXHeading')) {
          const line = state.doc.lineAt(node.from)
          const isOpeningMark = /^\s*$/.test(state.doc.sliceString(line.from, node.from))
          if (isOpeningMark) {
            while (end < line.to && /[ \t]/.test(state.doc.sliceString(end, end + 1))) end += 1
          }
        }

        builder.add(node.from, end, hideMark)
      }
    })
  }

  return builder.finish()
}

export const hideMarkdownMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)
