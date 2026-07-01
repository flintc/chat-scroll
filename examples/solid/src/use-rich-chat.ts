import {
  applyMicroChunk,
  expandSegments,
  type BotSegment,
  type MicroChunk,
  type RichMessage,
} from '@chat-scroll/example-shared'
import { useFakeChat, type UseFakeChatReturn } from './use-fake-chat'

export {
  seedFromPriorTurns,
  type Part,
  type RichMessage,
  type TextPart,
  type ThinkingPart,
  type ToolPart,
} from '@chat-scroll/example-shared'

export interface UseRichChatOptions {
  initial?: RichMessage[]
  segments: readonly BotSegment[]
  autoIntervalMs?: number
}

/**
 * `useRichChat` stands in for a real chat hook (Vercel `useChat`,
 * LangChain `useStream`) — it exposes a message tree with text /
 * thinking / tool parts and an `isStreaming` flag, and pushes chunks
 * into the tree on its own clock. Consumers wire `messages()` into JSX
 * and `isStreaming` into `createChatScroll({ streaming })`. They never
 * see the underlying chunk shape.
 */
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
