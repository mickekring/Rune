import { useCallback, useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  placeholder
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { theme } from './theme'
import { hideMarkdownMarks } from './markHiding'
import { inlineImages } from './inlineImages'
import { imageWidgetClicks, linkClicks } from './linkClicks'
import { tagHighlight } from './tagHighlight'
import { taskList } from './taskList'
import { tableStyling } from './tableStyling'
import { markdownShortcuts } from './markdownShortcuts'
import { listIndent } from './listIndent'

interface UseCodeMirrorOptions {
  initialValue: string
  onChange: (value: string) => void
  onCursorChange: (line: number, column: number) => void
}

// One EditorView per mount. The owner remounts the editor (via a React
// key) whenever a different document should be shown, so the view never
// has to swap documents in place — which keeps undo history, selection,
// and the update listener scoped to a single note.
export function useCodeMirror({ initialValue, onChange, onCursorChange }: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorChangeRef = useRef(onCursorChange)
  onChangeRef.current = onChange
  onCursorChangeRef.current = onCursorChange

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) onChangeRef.current(update.state.doc.toString())
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head
        const line = update.state.doc.lineAt(pos)
        onCursorChangeRef.current(line.number, pos - line.from + 1)
      }
    })

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          placeholder('Start writing...'),
          EditorView.lineWrapping,
          // Custom shortcuts first so they win over the defaults.
          keymap.of([
            ...markdownShortcuts,
            ...defaultKeymap,
            ...historyKeymap,
            ...closeBracketsKeymap,
            indentWithTab
          ]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          ...theme,
          hideMarkdownMarks,
          inlineImages,
          tagHighlight,
          taskList,
          tableStyling,
          listIndent,
          linkClicks,
          imageWidgetClicks,
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          updateListener
        ]
      }),
      parent: containerRef.current
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Mount-only: the owner changes the React key to load another document.
  }, [])

  const getValue = useCallback(() => viewRef.current?.state.doc.toString() ?? '', [])
  const getCaret = useCallback(() => viewRef.current?.state.selection.main.head ?? 0, [])
  const focus = useCallback(() => viewRef.current?.focus(), [])

  return { containerRef, viewRef, getValue, getCaret, focus }
}
