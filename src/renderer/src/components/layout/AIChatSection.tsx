import { memo, useEffect, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '@/lib/api'
import { useAppStore } from '@/store'
import { useChat, type ChatMessage } from '@/hooks/useChat'
import { useOllamaModels } from '@/hooks/useVaultData'
import { SendIcon, SlidersIcon, SpinnerIcon } from '../ui/icons'

interface AIChatSectionProps {
  currentFile: string | null
  getDocumentText: () => string
  onOpenSettings: () => void
}

export const AIChatSection = memo(function AIChatSection({
  currentFile,
  getDocumentText,
  onOpenSettings
}: AIChatSectionProps) {
  const model = useAppStore((s) => s.settings.ai.model)
  const systemPrompt = useAppStore((s) => s.settings.ai.systemPrompt)
  const { models, error: modelError } = useOllamaModels()
  const { messages, isStreaming, sendMessage, abort, clear } = useChat({
    filePath: currentFile,
    model,
    systemPromptTemplate: systemPrompt,
    getDocumentText
  })
  const canSend = !!currentFile && !!model && !isStreaming

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-scroll to the bottom on new messages / streaming chunks.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Autosize the textarea up to a cap.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft])

  const handleSend = (): void => {
    if (!draft.trim() || !canSend) return
    sendMessage(draft)
    setDraft('')
  }

  const showSetupHint = !model || models.length === 0

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <select
          className="flex-1 min-w-0 text-xs bg-muted text-foreground px-2 py-1 rounded border border-border-subtle focus:outline-none focus:ring-1 focus:ring-primary"
          value={model ?? ''}
          onChange={(e) => void api.setAIModel(e.target.value || null)}
          disabled={models.length === 0}
        >
          {models.length === 0 ? (
            <option value="">No models</option>
          ) : (
            <>
              {!model && <option value="">Select a model…</option>}
              {models.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </>
          )}
        </select>
        <button
          className="btn-ghost p-1 flex items-center justify-center"
          onClick={onOpenSettings}
          title="AI settings"
          aria-label="AI settings"
        >
          <SlidersIcon size={12} />
        </button>
      </div>

      {modelError && (
        <p className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">{modelError}</p>
      )}

      <div
        ref={listRef}
        className="max-h-[420px] min-h-[80px] overflow-y-auto rounded bg-muted/30 p-2 text-sm space-y-2"
      >
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-xs py-2 text-center">
            {showSetupHint ? 'Pick a model above to chat with this note.' : 'Ask anything about this note.'}
          </p>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>

      <div className="flex items-stretch gap-1.5">
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={canSend ? 'Ask about this note…' : 'Open a note first'}
          disabled={!canSend}
          className="flex-1 resize-none text-sm bg-muted text-foreground px-2 py-1.5 rounded border border-border-subtle focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          style={{ maxHeight: 160 }}
        />
        {isStreaming ? (
          <button
            className="self-end aspect-square rounded flex items-center justify-center transition-colors"
            style={{
              height: '2.125rem',
              color: 'var(--color-primary)',
              background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)'
            }}
            onClick={abort}
            title="Stop"
            aria-label="Stop streaming"
          >
            <SpinnerIcon size={14} className="animate-spin" />
          </button>
        ) : (
          <button
            className="self-end aspect-square rounded flex items-center justify-center transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              height: '2.125rem',
              background: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)'
            }}
            onClick={handleSend}
            disabled={!canSend || !draft.trim()}
            title="Send (Enter)"
            aria-label="Send"
          >
            <SendIcon size={14} />
          </button>
        )}
      </div>

      {messages.length > 0 && (
        <button className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={clear}>
          Clear conversation
        </button>
      )}
    </div>
  )
})

// Model output is untrusted: only web links survive, and they open in the
// default browser instead of navigating the window.
const urlTransform = (url: string): string => (/^(https?:|mailto:)/i.test(url) ? url : '')

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href || undefined}
      onClick={(e) => {
        e.preventDefault()
        if (href) void api.openExternal(href)
      }}
    >
      {children}
    </a>
  )
}

const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`px-2 py-1.5 rounded ${isUser ? 'bg-sidebar-hover text-foreground' : 'bg-transparent text-foreground/95'}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {isUser ? 'You' : 'Assistant'}
      </div>
      <div className="chat-markdown break-words leading-snug">
        <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
        {message.streaming && (
          <span className="inline-block w-1.5 h-3 ml-0.5 align-baseline bg-foreground/60 animate-pulse-subtle" />
        )}
      </div>
      {message.error && <div className="text-destructive mt-1 text-xs">{message.error}</div>}
    </div>
  )
})
