import type { EditorView, KeyBinding } from '@codemirror/view'
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'

const WORD_CHAR = /[\p{L}\p{N}_]/u

// Toggle a symmetric inline wrapper (e.g. `**` for bold, `_` for italic)
// around every selection range. Empty selection -> insert wrapper pair
// and place caret between. If the selection (or its immediate neighbours)
// already has the wrapper, strip it instead of re-wrapping.
export function toggleWrapSpec(state: EditorState, wrapper: string): TransactionSpec {
  const wlen = wrapper.length
  const doc = state.doc

  return state.changeByRange((range) => {
    const { from, to } = range

    if (from === to) {
      return {
        changes: [{ from, insert: wrapper + wrapper }],
        range: EditorSelection.cursor(from + wlen)
      }
    }

    const selected = doc.sliceString(from, to)

    // Case A: the selection itself is wrapped — e.g. `**word**` selected.
    if (selected.length >= wlen * 2 && selected.startsWith(wrapper) && selected.endsWith(wrapper)) {
      const inner = selected.slice(wlen, selected.length - wlen)
      return {
        changes: [{ from, to, insert: inner }],
        range: EditorSelection.range(from, from + inner.length)
      }
    }

    // Case B: the selection sits inside an existing wrap — `word` selected
    // within `**word**`. The wrapper must not be part of a larger word
    // (`my_var_name` with `var` selected is not italic).
    const before = doc.sliceString(Math.max(0, from - wlen), from)
    const after = doc.sliceString(to, Math.min(doc.length, to + wlen))
    const charBefore = from - wlen > 0 ? doc.sliceString(from - wlen - 1, from - wlen) : ''
    const charAfter = to + wlen < doc.length ? doc.sliceString(to + wlen, to + wlen + 1) : ''
    const standalone = !WORD_CHAR.test(charBefore) && !WORD_CHAR.test(charAfter)
    if (before === wrapper && after === wrapper && standalone) {
      return {
        changes: [
          { from: from - wlen, to: from, insert: '' },
          { from: to, to: to + wlen, insert: '' }
        ],
        range: EditorSelection.range(from - wlen, to - wlen)
      }
    }

    // Case C: wrap the selection.
    return {
      changes: [
        { from, insert: wrapper },
        { from: to, insert: wrapper }
      ],
      range: EditorSelection.range(from + wlen, to + wlen)
    }
  })
}

function toggleWrap(view: EditorView, wrapper: string): boolean {
  const spec = toggleWrapSpec(view.state, wrapper)
  view.dispatch(spec)
  return true
}

export const markdownShortcuts: readonly KeyBinding[] = [
  { key: 'Mod-b', run: (view) => toggleWrap(view, '**') },
  { key: 'Mod-i', run: (view) => toggleWrap(view, '_') }
]
