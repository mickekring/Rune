import { useEffect, useRef } from 'react'

// One window listener, one stack: only the most recently opened overlay
// reacts to Escape, so stacked modals close one at a time instead of all
// at once.

type Handler = () => void
const stack: Array<{ current: Handler }> = []
let listening = false

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || stack.length === 0) return
  e.preventDefault()
  stack[stack.length - 1].current()
}

export function useEscapeKey(enabled: boolean, handler: Handler): void {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!enabled) return
    const entry = { current: () => ref.current() }
    stack.push(entry)
    if (!listening) {
      window.addEventListener('keydown', onKeyDown)
      listening = true
    }
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      if (stack.length === 0 && listening) {
        window.removeEventListener('keydown', onKeyDown)
        listening = false
      }
    }
  }, [enabled])
}
