import { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { api } from '@/lib/api'

const LINK_CONTAINER_NODES = new Set(['Link', 'Image', 'Autolink'])

function getLinkUrlAt(view: EditorView, pos: number): string | null {
  const tree = syntaxTree(view.state)
  let node = tree.resolveInner(pos, 1)
  while (node && !LINK_CONTAINER_NODES.has(node.name)) {
    const parent = node.parent
    if (!parent) return null
    node = parent
  }
  let child = node.firstChild
  while (child) {
    if (child.name === 'URL') return view.state.doc.sliceString(child.from, child.to).trim()
    child = child.nextSibling
  }
  return null
}

// http(s)/mailto open in the default browser; everything else is treated
// as a vault-relative path that main confines to the vault and only hands
// to the OS for known document/media types.
function routeLinkUrl(url: string): void {
  if (/^(https?:\/\/|mailto:)/i.test(url)) {
    void api.openExternal(url)
    return
  }
  void api.openAttachment(url)
}

// Cmd/Ctrl-click on a link or image opens its URL. Plain click stays a
// cursor placement so rendered links can be edited.
export const linkClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos == null) return
    const url = getLinkUrlAt(view, pos)
    if (!url) return
    event.preventDefault()
    routeLinkUrl(url)
  }
})

// Cmd/Ctrl-click on a rendered inline image opens the file in the OS viewer.
export const imageWidgetClicks = EditorView.domEventHandlers({
  click(event) {
    if (!(event.metaKey || event.ctrlKey)) return
    const target = event.target as HTMLElement | null
    const wrap = target?.closest('.cm-inline-image') as HTMLElement | null
    const rel = wrap?.dataset.rel
    if (!rel) return
    event.preventDefault()
    void api.openAttachment(rel)
  }
})
