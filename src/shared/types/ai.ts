// Types shared between main and renderer for Ollama integration.

export interface OllamaModel {
  name: string
  size?: number
  modifiedAt?: string
}

export interface ChatMessageSend {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Event payloads streamed from main to renderer during a chat.
export interface ChatChunk {
  requestId: string
  delta: string
}

export interface ChatDone {
  requestId: string
}

export interface ChatError {
  requestId: string
  message: string
}

export const OLLAMA_BASE_URL = 'http://localhost:11434'
