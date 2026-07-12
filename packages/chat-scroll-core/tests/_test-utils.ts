/**
 * Test helpers for jsdom — gives us a fake but consistent layout model
 * so we can exercise scroll math without a real browser.
 */
import { vi } from 'vitest'
import { createGutter } from '../src/gutter'

export interface FakeContainer {
  el: HTMLElement
  setLayout: (opts: {
    clientHeight?: number
    scrollHeight?: number
    scrollTop?: number
    rectTop?: number
  }) => void
}

/**
 * Build a container/content pair with stubbed geometry. Mutating these
 * values triggers downstream scroll/resize math.
 */
export function buildScrollDom(opts?: {
  clientHeight?: number
  contentHeight?: number
  containerPaddingTop?: number
  containerPaddingBottom?: number
  contentMarginBottom?: number
}): {
  container: HTMLElement
  content: HTMLElement
  setContainerHeight: (h: number) => void
  setContentHeight: (h: number) => void
  /** Sets container.style.padding so getComputedStyle reads it AND
   *  the stubbed scrollHeight / gutter.offsetTop reflect it. */
  setContainerPadding: (top: number, bottom: number) => void
  /** Margin between content and the gutter (block layout sibling gap). */
  setContentMarginBottom: (mb: number) => void
  setScrollTop: (top: number) => void
  /** Current max-scroll — useful for tight-pin assertions. */
  maxScroll: () => number
  /** Create + lay-out the gutter (offsetTop/offsetHeight stubbed). Use
   *  this instead of `createGutter()` directly when the gutter's layout
   *  metrics matter to the test. */
  mountGutter: () => HTMLElement
  flushScroll: () => void
  resizeContent: () => void
} {
  const container = document.createElement('div')
  const content = document.createElement('div')
  container.appendChild(content)
  document.body.appendChild(container)

  let containerH = opts?.clientHeight ?? 600
  let contentH = opts?.contentHeight ?? 400
  let paddingTop = opts?.containerPaddingTop ?? 0
  let paddingBottom = opts?.containerPaddingBottom ?? 0
  let contentMarginBottom = opts?.contentMarginBottom ?? 0
  let scrollTop = 0

  function setStylePadding(): void {
    container.style.paddingTop = `${paddingTop}px`
    container.style.paddingBottom = `${paddingBottom}px`
  }
  setStylePadding()

  function gutterEl(): HTMLElement | null {
    return container.querySelector<HTMLElement>('[data-chat-scroll-gutter]')
  }

  // Patch scroll/layout reads on the *container*. We must include any
  // gutter the controller appends inside container — count it as part
  // of `scrollHeight`. We also include container padding-top and
  // padding-bottom, which real browsers count when content overflows.
  function gutterH(): number {
    const g = gutterEl()
    if (!g) return 0
    // Read the inline style we set in setGutterHeight().
    const px = g.style.height
    return px ? parseInt(px, 10) || 0 : 0
  }

  function intrinsicScrollHeight(): number {
    // Real browsers: scrollHeight = max(clientHeight, paddingTop + sum-of-children + paddingBottom).
    return Math.max(
      containerH,
      paddingTop + contentH + contentMarginBottom + gutterH() + paddingBottom,
    )
  }

  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    get: () => containerH,
  })
  Object.defineProperty(container, 'scrollHeight', {
    configurable: true,
    get: () => intrinsicScrollHeight(),
  })
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v: number) => {
      const max = Math.max(0, intrinsicScrollHeight() - containerH)
      scrollTop = Math.min(Math.max(0, v), max)
    },
  })
  container.scrollTo = (arg: ScrollToOptions | number, y?: number) => {
    const max = Math.max(0, intrinsicScrollHeight() - containerH)
    if (typeof arg === 'number') {
      scrollTop = clamp(y ?? 0, 0, max)
      return
    }
    if (arg && typeof arg === 'object' && 'top' in arg) {
      scrollTop = clamp(arg.top ?? 0, 0, max)
    }
  }

  Object.defineProperty(content, 'scrollHeight', {
    configurable: true,
    get: () => contentH,
  })
  Object.defineProperty(content, 'offsetHeight', {
    configurable: true,
    get: () => contentH,
  })
  Object.defineProperty(content, 'offsetTop', {
    configurable: true,
    get: () => paddingTop,
  })

  function patchGutter(g: HTMLElement): void {
    if (Object.getOwnPropertyDescriptor(g, 'offsetTop')) return
    Object.defineProperty(g, 'offsetTop', {
      configurable: true,
      get: () => paddingTop + contentH + contentMarginBottom,
    })
    Object.defineProperty(g, 'offsetHeight', {
      configurable: true,
      get: () => gutterH(),
    })
    // Also stub the gutter's bounding rect so the formula's
    // `gRect.top - cRect.top + scrollTop` derivation lands on the same
    // value as the old `gutter.offsetTop` reads. Container has no
    // border in this model so the "subtract border-top" step is a
    // no-op. Container always sits at viewport y=0 (see container's
    // own getBoundingClientRect stub above).
    g.getBoundingClientRect = () =>
      ({
        top: paddingTop + contentH + contentMarginBottom - scrollTop,
        left: 0,
        bottom:
          paddingTop + contentH + contentMarginBottom - scrollTop + gutterH(),
        right: 800,
        width: 800,
        height: gutterH(),
        x: 0,
        y: paddingTop + contentH + contentMarginBottom - scrollTop,
        toJSON: () => ({}),
      }) as DOMRect
  }

  // Auto-patch any gutter element appended to the container. This makes
  // the test util a drop-in for the controller's internal gutter
  // creation (`createGutter` inside `mount`) without the test having to
  // know when that happens. Synchronous (vs MutationObserver) so the
  // patch is in place before the next read.
  const origAppendChild = container.appendChild.bind(container)
  container.appendChild = (<T extends Node>(node: T): T => {
    const result = origAppendChild(node) as T
    if (
      node instanceof HTMLElement &&
      node.hasAttribute('data-chat-scroll-gutter')
    ) {
      patchGutter(node)
    }
    return result
  }) as typeof container.appendChild

  // Container occupies the viewport at y=0..containerH.
  // Content sits at the top of the container, before any scroll.
  container.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      bottom: containerH,
      right: 800,
      width: 800,
      height: containerH,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect

  function clamp(n: number, lo: number, hi: number): number {
    return Math.min(Math.max(n, lo), hi)
  }

  function flushScroll(): void {
    container.dispatchEvent(new Event('scroll'))
  }

  return {
    container,
    content,
    setContainerHeight(h) {
      containerH = h
    },
    setContentHeight(h) {
      contentH = h
    },
    setContainerPadding(top, bottom) {
      paddingTop = top
      paddingBottom = bottom
      setStylePadding()
    },
    setContentMarginBottom(mb) {
      contentMarginBottom = mb
    },
    setScrollTop(t) {
      const max = Math.max(0, intrinsicScrollHeight() - containerH)
      scrollTop = clamp(t, 0, max)
    },
    maxScroll() {
      return Math.max(0, intrinsicScrollHeight() - containerH)
    },
    mountGutter() {
      const g = createGutter(container)
      patchGutter(g)
      return g
    },
    flushScroll,
    resizeContent() {
      ;(globalThis as { __triggerResize?: () => void }).__triggerResize?.()
    },
  }
}

/**
 * Install a fake ResizeObserver that lets the test trigger callbacks
 * manually via `triggerResize()`.
 */
export interface FakeResizeObservation {
  target: Element
  box?: ResizeObserverBoxOptions
}

export function installFakeResizeObserver(): {
  triggerResize: () => void
  uninstall: () => void
  callbacks: () => Set<ResizeObserverCallback>
  /** Every `observe(target, options)` call across all instances. */
  observations: () => FakeResizeObservation[]
} {
  const callbacks = new Set<ResizeObserverCallback>()
  const observations: FakeResizeObservation[] = []
  const original = globalThis.ResizeObserver

  class FakeResizeObserver implements ResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      callbacks.add(cb)
    }
    observe(target: Element, options?: ResizeObserverOptions): void {
      observations.push({ target, box: options?.box })
    }
    unobserve(): void {}
    disconnect(): void {
      callbacks.forEach(() => {})
    }
  }

  ;(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver

  return {
    triggerResize() {
      callbacks.forEach((cb) =>
        cb([] as ResizeObserverEntry[], {} as ResizeObserver),
      )
    },
    uninstall() {
      ;(
        globalThis as { ResizeObserver: typeof ResizeObserver }
      ).ResizeObserver = original
    },
    callbacks: () => callbacks,
    observations: () => observations,
  }
}

/**
 * Install a fake `requestAnimationFrame` that runs synchronously when
 * `flushFrames()` is called, so we can drive deferred work in tests.
 */
export function installFakeRaf(): {
  flushFrames: () => void
  uninstall: () => void
} {
  const callbacks: FrameRequestCallback[] = []
  const originalRaf = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  let nextId = 1
  const idMap = new Map<number, FrameRequestCallback>()

  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextId++
    idMap.set(id, cb)
    callbacks.push(cb)
    return id
  }) as typeof requestAnimationFrame

  globalThis.cancelAnimationFrame = ((id: number) => {
    const cb = idMap.get(id)
    if (cb) {
      const idx = callbacks.indexOf(cb)
      if (idx >= 0) callbacks.splice(idx, 1)
      idMap.delete(id)
    }
  }) as typeof cancelAnimationFrame

  return {
    flushFrames() {
      // Drain all pending callbacks. `flushFrames` is reentrancy-safe — a
      // callback that schedules another frame will be picked up on the
      // next call (matches real rAF semantics).
      const drained = callbacks.splice(0, callbacks.length)
      idMap.clear()
      drained.forEach((cb) => cb(performance.now()))
    },
    uninstall() {
      globalThis.requestAnimationFrame = originalRaf
      globalThis.cancelAnimationFrame = originalCancel
    },
  }
}

/**
 * Stub `prefers-reduced-motion`. Returns a setter so individual tests
 * can flip the value mid-suite.
 */
export function installMatchMedia(prefersReducedMotion = false): {
  setReducedMotion: (v: boolean) => void
  uninstall: () => void
} {
  let value = prefersReducedMotion
  const original = window.matchMedia
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('reduce') ? value : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })) as unknown as typeof window.matchMedia

  return {
    setReducedMotion(v) {
      value = v
    },
    uninstall() {
      window.matchMedia = original
    },
  }
}

/**
 * Append a child to `parent` with stubbed geometry. Used to create
 * "messages" in tests so we can pin them.
 */
export function appendMessage(
  container: HTMLElement,
  content: HTMLElement,
  opts: {
    role?: 'user' | 'assistant'
    height: number
    /** Y offset in document coords (= top of msg in container's frame). */
    y: number
  },
): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-role', opts.role ?? 'assistant')
  content.appendChild(el)
  // Shift with the container's scrollTop so `offsetWithin` returns the
  // stable document-coord `y` regardless of where the user has scrolled.
  // Real browsers behave the same way; without this, pinning a message a
  // second time would double-count the prior scroll offset.
  el.getBoundingClientRect = () => {
    const top = opts.y - container.scrollTop
    return {
      top,
      left: 0,
      bottom: top + opts.height,
      right: 800,
      width: 800,
      height: opts.height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect
  }
  el.scrollIntoView = vi.fn()
  return el
}
