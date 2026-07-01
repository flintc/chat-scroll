import type { MicroChunk } from './segments'

/**
 * The rich message shape the pin-to-top demos render: a message is a
 * list of text / thinking / tool parts, and [[applyMicroChunk]] folds
 * one [[MicroChunk]] per tick into the last part. Framework-agnostic —
 * the reducer never mutates, so it works with React state, Solid
 * signals, and Vue refs alike. Each example's `useRichChat` wires it
 * into that framework's fake-chat hook.
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

/**
 * Pure reducer: fold one micro-chunk into a message, returning a new
 * message (never mutating), so it is safe under any framework's
 * reactivity model.
 */
export function applyMicroChunk(msg: RichMessage, c: MicroChunk): RichMessage {
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
