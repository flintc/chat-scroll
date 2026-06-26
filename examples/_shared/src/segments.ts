import type { BotSegment } from './lipsum'

/**
 * Micro-chunks consumed one per tick. This is the streaming layer the
 * pin-to-top demo renders against. `expandSegments` flattens the
 * high-level [[BotSegment]] sequence into a stream of micro-chunks so
 * each tick advances the assistant by a small visible increment — text
 * by a word, thinking/tool bodies by a word — keeping the
 * ResizeObserver firing throughout the turn instead of in one jump.
 */
export type MicroChunk =
  | { type: 'text'; text: string }
  | {
      type: 'block-open'
      kind: 'thinking'
      summary: string
      defaultOpen: boolean
    }
  | {
      type: 'block-open'
      kind: 'tool'
      name: string
      defaultOpen: boolean
    }
  | { type: 'block-args'; text: string }
  | { type: 'block-body'; text: string }
  | { type: 'block-close' }

export interface ExpandOptions {
  /**
   * Approx. characters per micro-chunk for streamed bodies. Lower =
   * more frames of growth = more ResizeObserver activity = better
   * stress test of the controller. Default 24.
   */
  bodyChunkChars?: number
  /**
   * Approx. characters per micro-chunk for streamed tool args —
   * smaller than bodies so the call visibly assembles in the summary
   * the way LLM APIs deliver tool-call argument deltas. Default 12.
   */
  argsChunkChars?: number
}

/**
 * Split a string into chunks of roughly `chunkChars` characters on word
 * boundaries. Words longer than the budget pass through whole.
 */
export function chunkString(s: string, chunkChars: number): string[] {
  if (chunkChars <= 0) return [s]
  const out: string[] = []
  let buf = ''
  // Split keeping whitespace so newlines render correctly.
  const parts = s.split(/(\s+)/)
  for (const p of parts) {
    if (buf.length + p.length >= chunkChars && buf.length > 0) {
      out.push(buf)
      buf = ''
    }
    buf += p
  }
  if (buf.length > 0) out.push(buf)
  return out
}

/**
 * Flatten a BotSegment sequence into a list of one-tick micro-chunks.
 * Thinking and tool bodies are split so the block's content streams in
 * over many ticks instead of appearing in one.
 */
export function expandSegments(
  segments: readonly BotSegment[],
  opts: ExpandOptions = {},
): MicroChunk[] {
  const bodyChunkChars = opts.bodyChunkChars ?? 24
  const argsChunkChars = opts.argsChunkChars ?? 12
  const out: MicroChunk[] = []
  for (const seg of segments) {
    if (seg.type === 'text') {
      out.push({ type: 'text', text: seg.text })
      continue
    }
    if (seg.type === 'thinking') {
      out.push({
        type: 'block-open',
        kind: 'thinking',
        summary: seg.summary,
        defaultOpen: Boolean(seg.defaultOpen),
      })
      for (const ch of chunkString(seg.body, bodyChunkChars)) {
        out.push({ type: 'block-body', text: ch })
      }
      out.push({ type: 'block-close' })
      continue
    }
    // tool — the call's arguments stream into the summary first (LLM
    // APIs deliver tool calls as argument deltas), then the result
    // streams into the body once the call "runs".
    out.push({
      type: 'block-open',
      kind: 'tool',
      name: seg.name,
      defaultOpen: Boolean(seg.defaultOpen),
    })
    for (const ch of chunkString(seg.args, argsChunkChars)) {
      out.push({ type: 'block-args', text: ch })
    }
    for (const ch of chunkString(seg.result, bodyChunkChars)) {
      out.push({ type: 'block-body', text: ch })
    }
    out.push({ type: 'block-close' })
  }
  return out
}
