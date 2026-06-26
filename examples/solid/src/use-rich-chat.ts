import {
  expandSegments,
  type BotSegment,
  type MicroChunk,
} from '@chat-scroll/example-shared'
import { useFakeChat, type UseFakeChatReturn } from './use-fake-chat'

/**
 * `useRichChat` stands in for a real chat hook (Vercel `useChat`,
 * LangChain `useStream`) — it exposes a message tree with text /
 * thinking / tool parts and an `isStreaming` flag, and pushes chunks
 * into the tree on its own clock. Consumers wire `messages()` into JSX
 * and `isStreaming` into `createChatScroll({ streaming })`. They never
 * see the underlying chunk shape.
 */

export type TextPart = { type: 'text'; text: string }
export type ThinkingPart = {
  type: 'thinking'
  summary: string
  body: string
  defaultOpen: boolean
}
export type ToolPart = {
  type: 'tool'
  name: string
  args: string
  result: string
  defaultOpen: boolean
}
export type Part = TextPart | ThinkingPart | ToolPart

export interface RichMessage {
  id: number
  role: 'user' | 'assistant'
  parts: Part[]
}

export interface UseRichChatOptions {
  initial?: RichMessage[]
  segments: readonly BotSegment[]
  autoIntervalMs?: number
}

export function useRichChat(
  opts: UseRichChatOptions,
): UseFakeChatReturn<RichMessage> {
  return useFakeChat<RichMessage, MicroChunk>({
    initial: opts.initial,
    responseChunks: expandSegments(opts.segments),
    eagerPlaceholder: true,
    autoIntervalMs: opts.autoIntervalMs,
    createUserMessage: (text, id) => ({
      id,
      role: 'user',
      parts: [{ type: 'text', text }],
    }),
    createAssistantMessage: (id) => ({ id, role: 'assistant', parts: [] }),
    applyChunk: applyMicroChunk,
  })
}

/**
 * Lift the canonical prior-turns sequence into the rich message shape.
 * Useful for seeding the chat with a short history.
 */
export function seedFromPriorTurns(
  turns: readonly { role: 'user' | 'bot'; text: string }[],
): RichMessage[] {
  let id = 0
  return turns.map((t) => ({
    id: --id,
    role: t.role === 'bot' ? 'assistant' : 'user',
    parts: [{ type: 'text', text: t.text }],
  }))
}

function applyMicroChunk(msg: RichMessage, c: MicroChunk): RichMessage {
  const parts = msg.parts.slice()
  const i = parts.length - 1
  const last = parts[i]
  if (c.type === 'text') {
    if (last?.type === 'text') {
      parts[i] = { ...last, text: last.text + c.text }
    } else {
      parts.push({ type: 'text', text: c.text })
    }
  } else if (c.type === 'block-open') {
    parts.push(
      c.kind === 'thinking'
        ? {
            type: 'thinking',
            summary: c.summary,
            body: '',
            defaultOpen: c.defaultOpen,
          }
        : {
            type: 'tool',
            name: c.name,
            args: '',
            result: '',
            defaultOpen: c.defaultOpen,
          },
    )
  } else if (c.type === 'block-args') {
    if (last?.type === 'tool') {
      parts[i] = { ...last, args: last.args + c.text }
    }
  } else if (c.type === 'block-body') {
    if (last?.type === 'thinking') {
      parts[i] = { ...last, body: last.body + c.text }
    } else if (last?.type === 'tool') {
      parts[i] = { ...last, result: last.result + c.text }
    }
  }
  return { ...msg, parts }
}
