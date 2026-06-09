import {
  createBlock,
  type CreatedBlock,
} from './blocks'
import type { BotSegment } from './lipsum'
import { expandSegments, type MicroChunk } from './segments'

/**
 * Per-bot-bubble streamer. Each `tick()` consumes one MicroChunk:
 *   - text → append to (or create) the current text run
 *   - block-open → create a thinking/tool card, set as current body target
 *   - block-body → append text to the current block body
 *   - block-close → close the current block
 *
 * Framework-agnostic — Solid/Vue/vanilla scenarios all mount a target
 * `<div>` via their framework's ref API and let this fill it.
 */
export interface BotStreamer {
  tick: () => boolean
  finish: () => void
  hasMore: () => boolean
  reset: (bot: HTMLElement, segments: readonly BotSegment[]) => void
  blockCount: () => number
}

export interface BotStreamerOptions {
  initialBlockIndex?: number
  bodyChunkChars?: number
}

export function createBotStreamer(
  opts: BotStreamerOptions = {},
): BotStreamer {
  let bot: HTMLElement | null = null
  let chunks: MicroChunk[] = []
  let idx = 0
  let blockIndex = opts.initialBlockIndex ?? 0
  let textRun: HTMLElement | null = null
  let blockBody: CreatedBlock | null = null

  function applyChunk(c: MicroChunk): void {
    if (!bot) return
    if (c.type === 'text') {
      if (!textRun || textRun.parentElement !== bot) {
        const run = document.createElement('div')
        run.className = 'msg__text'
        bot.appendChild(run)
        textRun = run
      }
      textRun.textContent = (textRun.textContent ?? '') + c.text
      return
    }
    if (c.type === 'block-open') {
      textRun = null
      const created =
        c.kind === 'thinking'
          ? createBlock({
              kind: 'thinking',
              defaultOpen: c.defaultOpen,
              index: blockIndex,
              title: c.summary,
            })
          : createBlock({
              kind: 'tool',
              defaultOpen: c.defaultOpen,
              index: blockIndex,
              title: c.name,
              args: c.args,
            })
      bot.appendChild(created.wrap)
      blockBody = created
      blockIndex += 1
      return
    }
    if (c.type === 'block-body') {
      blockBody?.appendBody(c.text)
      return
    }
    if (c.type === 'block-close') {
      blockBody = null
      return
    }
  }

  return {
    tick() {
      const c = chunks[idx]
      if (c === undefined) return false
      applyChunk(c)
      idx += 1
      return idx < chunks.length
    },
    finish() {
      while (idx < chunks.length) {
        applyChunk(chunks[idx]!)
        idx += 1
      }
    },
    hasMore() {
      return idx < chunks.length
    },
    reset(nextBot, segments) {
      bot = nextBot
      chunks = expandSegments(segments, {
        bodyChunkChars: opts.bodyChunkChars,
      })
      idx = 0
      textRun = null
      blockBody = null
    },
    blockCount() {
      return blockIndex
    },
  }
}
