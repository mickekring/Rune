import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { toggleWrapSpec } from './markdownShortcuts'

function apply(doc: string, from: number, to: number, wrapper: string): { doc: string; from: number; to: number } {
  const state = EditorState.create({ doc, selection: EditorSelection.range(from, to) })
  const next = state.update(toggleWrapSpec(state, wrapper)).state
  const sel = next.selection.main
  return { doc: next.doc.toString(), from: sel.from, to: sel.to }
}

describe('toggleWrapSpec', () => {
  it('wraps a selection and keeps it selected', () => {
    expect(apply('hello world', 0, 5, '**')).toEqual({ doc: '**hello** world', from: 2, to: 7 })
  })

  it('inserts an empty pair at the caret', () => {
    expect(apply('ab', 1, 1, '_')).toEqual({ doc: 'a__b', from: 2, to: 2 })
  })

  it('unwraps when the wrapper is part of the selection', () => {
    expect(apply('**hello** world', 0, 9, '**')).toEqual({ doc: 'hello world', from: 0, to: 5 })
  })

  it('unwraps when the wrapper surrounds the selection as a standalone span', () => {
    expect(apply('say _hello_ now', 5, 10, '_')).toEqual({ doc: 'say hello now', from: 4, to: 9 })
  })

  it('does not treat underscores inside a word as emphasis', () => {
    // Selecting "var" in my_var_name used to produce "myvarname".
    expect(apply('my_var_name', 3, 6, '_').doc).toBe('my__var__name')
  })
})
