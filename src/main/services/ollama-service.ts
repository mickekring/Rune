import type { ChatMessageSend, OllamaModel } from '@shared/types/ai'
import { OLLAMA_BASE_URL } from '@shared/types/ai'
import type { Result } from '@shared/ipc'

// Abort a stream that produces nothing for this long.
const STALL_TIMEOUT_MS = 60_000
// A single NDJSON line should never approach this; treat it as a broken stream.
const MAX_LINE_BUFFER = 1_000_000
const UNREACHABLE = 'Could not reach Ollama at localhost:11434 — is it running?'

function describe(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.includes('fetch failed') || msg.includes('ECONNREFUSED') ? UNREACHABLE : msg
}

/** Installed models, or a friendly error when Ollama is not running. */
export async function listModels(): Promise<Result<{ models: OllamaModel[] }>> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    })
    if (!res.ok) return { ok: false, error: `Ollama returned ${res.status}` }
    const data = (await res.json()) as {
      models?: Array<{ name: string; size?: number; modified_at?: string }>
    }
    const models: OllamaModel[] = (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at
    }))
    return { ok: true, models }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

/**
 * Stream a chat completion. Calls onDelta per text chunk, onDone when the
 * stream finishes, onError otherwise. `signal` cancels; a stall timeout
 * guards against a server that stops sending without closing.
 */
export async function streamChat(
  model: string,
  messages: ChatMessageSend[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): Promise<void> {
  const internal = new AbortController()
  let stalled = false
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  const armStall = (): void => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = setTimeout(() => {
      stalled = true
      internal.abort()
    }, STALL_TIMEOUT_MS)
  }
  const onUserAbort = (): void => internal.abort()
  signal.addEventListener('abort', onUserAbort, { once: true })
  const cleanup = (): void => {
    if (stallTimer) clearTimeout(stallTimer)
    signal.removeEventListener('abort', onUserAbort)
  }
  const handleFailure = (error: unknown): void => {
    if (signal.aborted) return
    if (stalled) {
      onError(`No response from Ollama for ${STALL_TIMEOUT_MS / 1000} seconds`)
      return
    }
    onError(describe(error))
  }

  let res: Response
  try {
    armStall()
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: internal.signal
    })
  } catch (error) {
    cleanup()
    handleFailure(error)
    return
  }

  if (!res.ok || !res.body) {
    let detail = `Ollama returned ${res.status}`
    try {
      const body = (await res.text()).slice(0, 500)
      if (body) detail = `${detail}: ${body}`
    } catch {
      /* ignore */
    }
    cleanup()
    onError(detail)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      armStall()
      buffer += decoder.decode(value, { stream: true })
      if (buffer.length > MAX_LINE_BUFFER) throw new Error('Malformed stream from Ollama')
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) continue
        let obj: { message?: { content?: string }; done?: boolean; error?: string }
        try {
          obj = JSON.parse(line)
        } catch {
          continue
        }
        if (obj.error) {
          cleanup()
          onError(obj.error)
          return
        }
        if (obj.message?.content) onDelta(obj.message.content)
        if (obj.done) {
          cleanup()
          onDone()
          return
        }
      }
    }
    cleanup()
    onDone()
  } catch (error) {
    cleanup()
    handleFailure(error)
  }
}
