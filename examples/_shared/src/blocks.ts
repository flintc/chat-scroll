/**
 * DOM helpers for rendering streamed expandable blocks (thinking, tool
 * calls). Used directly by the vanilla scenarios and via narrow
 * wrappers by Solid/Vue scenarios so the visual is identical across
 * frameworks.
 *
 * Custom collapsible (not `<details>`) so we can animate open/close via
 * CSS `grid-template-rows` going `0fr → 1fr`. With `<details>` the
 * children's display jumps on toggle and the chat-scroll re-anchor
 * logic only sees one resize. With an animated transition, the
 * ResizeObserver fires many times across ~200ms — exercising the
 * controller's re-anchor logic continuously.
 */

export interface CreatedBlock {
  wrap: HTMLElement
  body: HTMLElement
  appendBody: (text: string) => void
}

export interface CreateBlockOptions {
  kind: 'thinking' | 'tool'
  defaultOpen: boolean
  /** Index used by tests via `data-block-index`. */
  index: number
  /** Thinking summary OR tool function name. */
  title: string
  /** Tool args (e.g. `{ query: "..." }`). Ignored for thinking. */
  args?: string
}

export function createBlock(opts: CreateBlockOptions): CreatedBlock {
  const wrap = document.createElement('div')
  wrap.className =
    opts.kind === 'thinking' ? 'block block--thinking' : 'block block--tool'
  wrap.dataset.test = 'expand-block'
  wrap.dataset.blockIndex = String(opts.index)
  wrap.dataset.open = opts.defaultOpen ? 'true' : 'false'

  const summary = document.createElement('button')
  summary.type = 'button'
  summary.className = 'block__summary'
  summary.setAttribute('aria-expanded', opts.defaultOpen ? 'true' : 'false')
  if (opts.kind === 'thinking') {
    summary.innerHTML =
      `<span class="block__icon" aria-hidden="true">💭</span>` +
      `<span class="block__title">${escapeHtml(opts.title)}</span>` +
      `<span class="block__chev" aria-hidden="true">▾</span>`
  } else {
    const args = opts.args ?? ''
    summary.innerHTML =
      `<span class="block__icon" aria-hidden="true">🛠</span>` +
      `<span class="block__title">${escapeHtml(opts.title)}` +
      `<span class="block__args">${escapeHtml(args)}</span></span>` +
      `<span class="block__chev" aria-hidden="true">▾</span>`
  }
  summary.addEventListener('click', () =>
    setBlockOpen(wrap, wrap.dataset.open !== 'true'),
  )
  wrap.appendChild(summary)

  const bodyWrap = document.createElement('div')
  bodyWrap.className = 'block__wrap'
  const body = document.createElement('div')
  body.className = 'block__body'

  // Tool result is rendered as a `<pre>` so monospace + preserved
  // newlines look like terminal output. Thinking renders as italic
  // prose.
  let textTarget: HTMLElement
  if (opts.kind === 'tool') {
    const pre = document.createElement('pre')
    pre.className = 'block__pre'
    body.appendChild(pre)
    textTarget = pre
  } else {
    textTarget = body
  }
  bodyWrap.appendChild(body)
  wrap.appendChild(bodyWrap)

  return {
    wrap,
    body,
    appendBody(text: string) {
      textTarget.textContent = (textTarget.textContent ?? '') + text
    },
  }
}

export function setBlockOpen(wrap: HTMLElement, open: boolean): void {
  wrap.dataset.open = open ? 'true' : 'false'
  const summary = wrap.querySelector('.block__summary')
  if (summary) summary.setAttribute('aria-expanded', open ? 'true' : 'false')
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
