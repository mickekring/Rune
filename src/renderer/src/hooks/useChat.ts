import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessageSend } from '@shared/types/ai'
import { api } from '@/lib/api'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  // True while the assistant is still streaming this message.
  streaming?: boolean
  // Set if this message ended with an error instead of a completion.
  error?: string
}

interface UseChatOptions {
  // Unique per document — chat resets when the file changes.
  filePath: string | null
  model: string | null
  // Raw system-prompt template from settings. May contain {{document}}.
  systemPromptTemplate: string
  // Read at send time so the freshest text goes into the prompt.
  getDocumentText: () => string
}

function buildSystemPrompt(template: string, doc: string): string {
  if (template.includes('{{document}}')) return template.replace('{{document}}', doc)
  // If the user removed the placeholder, append the doc so the model
  // still has context instead of silently losing it.
  return `${template}\n\n---\nDocument:\n---\n${doc}`
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useChat({ filePath, model, systemPromptTemplate, getDocumentText }: UseChatOptions): {
  messages: ChatMessage[]
  isStreaming: boolean
  sendMessage: (text: string) => void
  abort: () => void
  clear: () => void
} {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesRef = useRef<ChatMessage[]>([])
  const requestIdRef = useRef<string | null>(null)
  const optionsRef = useRef({ model, systemPromptTemplate, getDocumentText })
  optionsRef.current = { model, systemPromptTemplate, getDocumentText }

  const update = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  const patchLast = useCallback(
    (patch: (last: ChatMessage) => ChatMessage) => {
      const prev = messagesRef.current
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        update([...prev.slice(0, -1), patch(last)])
      }
    },
    [update]
  )

  // Reset when the file changes.
  useEffect(() => {
    update([])
    setIsStreaming(false)
    requestIdRef.current = null
  }, [filePath, update])

  useEffect(() => {
    const unsubChunk = window.api.on('ai:chat-chunk', ({ requestId, delta }) => {
      if (requestId !== requestIdRef.current) return
      patchLast((last) => ({ ...last, content: last.content + delta }))
    })
    const unsubDone = window.api.on('ai:chat-done', ({ requestId }) => {
      if (requestId !== requestIdRef.current) return
      requestIdRef.current = null
      setIsStreaming(false)
      patchLast((last) => ({ ...last, streaming: false }))
    })
    const unsubError = window.api.on('ai:chat-error', ({ requestId, message }) => {
      if (requestId !== requestIdRef.current) return
      requestIdRef.current = null
      setIsStreaming(false)
      const prev = messagesRef.current
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        update([...prev.slice(0, -1), { ...last, streaming: false, error: message }])
      } else {
        update([...prev, { id: makeId(), role: 'assistant', content: '', error: message }])
      }
    })
    return () => {
      unsubChunk()
      unsubDone()
      unsubError()
    }
  }, [patchLast, update])

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      const { model: currentModel, systemPromptTemplate: template, getDocumentText: getDoc } =
        optionsRef.current
      if (!trimmed || !currentModel || requestIdRef.current) return

      const history: ChatMessageSend[] = messagesRef.current
        .filter((m) => !(m.role === 'assistant' && (m.streaming || m.error)))
        .map((m) => ({ role: m.role, content: m.content }))
      const outgoing: ChatMessageSend[] = [
        { role: 'system', content: buildSystemPrompt(template, getDoc()) },
        ...history,
        { role: 'user', content: trimmed }
      ]

      const requestId = makeId()
      requestIdRef.current = requestId
      setIsStreaming(true)
      update([
        ...messagesRef.current,
        { id: makeId(), role: 'user', content: trimmed },
        { id: makeId(), role: 'assistant', content: '', streaming: true }
      ])

      api.chatStart(requestId, currentModel, outgoing).catch((error) => {
        console.error('ai:chat-start failed', error)
      })
    },
    [update]
  )

  const abort = useCallback(() => {
    const id = requestIdRef.current
    if (!id) return
    api.chatAbort(id).catch(() => {})
    requestIdRef.current = null
    setIsStreaming(false)
    patchLast((last) => ({ ...last, streaming: false, error: 'Cancelled' }))
  }, [patchLast])

  const clear = useCallback(() => {
    abort()
    update([])
  }, [abort, update])

  return { messages, isStreaming, sendMessage, abort, clear }
}
