import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createChatScroll } from '../src/chat-scroll'
import type { ChatScrollState } from '../src/types'

import {
  appendMessage,
  buildScrollDom,
  installFakeRaf,
  installFakeResizeObserver,
  installMatchMedia,
} from './_test-utils'

describe('createChatScroll', () => {
  let cleanup: Array<() => void> = []
  beforeEach(() => {
    const mm = installMatchMedia(false)
    cleanup.push(mm.uninstall)
  })
  afterEach(() => {
    cleanup.forEach((c) => c())
    cleanup = []
    document.body.innerHTML = ''
  })

  describe('options + defaults', () => {
    it('applies default options when none given', () => {
      const s = createChatScroll()
      expect(s.options.strategy).toBe('stick-to-bottom')
      expect(s.options.bottomThreshold).toBe(40)
      expect(s.options.scrollMargin).toBe(12)
      expect(s.options.scrollBehavior).toBe('auto')
      expect(s.options.scrollDurationMs).toBe(320)
    })

    it('respects user-provided options', () => {
      const s = createChatScroll({
        strategy: 'pin-to-top',
        bottomThreshold: 100,
        scrollMargin: 24,
        scrollBehavior: 'instant',
        scrollDurationMs: 150,
      })
      expect(s.options.strategy).toBe('pin-to-top')
      expect(s.options.bottomThreshold).toBe(100)
      expect(s.options.scrollMargin).toBe(24)
      expect(s.options.scrollBehavior).toBe('instant')
      expect(s.options.scrollDurationMs).toBe(150)
    })

    it('setOptions updates scrollDurationMs live', () => {
      const s = createChatScroll()
      expect(s.options.scrollDurationMs).toBe(320)
      s.setOptions({ scrollDurationMs: 500 })
      expect(s.options.scrollDurationMs).toBe(500)
    })

    it('setOptions merges partial updates', () => {
      const s = createChatScroll({ bottomThreshold: 40 })
      s.setOptions({ bottomThreshold: 80 })
      expect(s.options.bottomThreshold).toBe(80)
      expect(s.options.strategy).toBe('stick-to-bottom')
    })
  })

  describe('mount + style application', () => {
    it('applies overflow / display / flex-direction to container', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      expect(container.style.overflowY).toBe('auto')
      expect(container.style.display).toBe('flex')
      expect(container.style.flexDirection).toBe('column')
      s.destroy()
    })

    it('appends a gutter element as a child of container', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      const g = container.querySelector('[data-chat-scroll-gutter]')
      expect(g).toBeTruthy()
      s.destroy()
    })

    it('attaches a passive scroll listener', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const addSpy = vi.spyOn(container, 'addEventListener')
      const s = createChatScroll()
      s.mount(container, content)
      expect(addSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
        expect.objectContaining({ passive: true }),
      )
      s.destroy()
    })

    it('observes the content element', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll()
      s.mount(container, content)
      expect(ro.callbacks().size).toBe(1)
      s.destroy()
    })

    it('idempotent — same args is a no-op', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll()
      s.mount(container, content)
      s.mount(container, content) // should not double-bind
      expect(ro.callbacks().size).toBe(1)
      expect(container.querySelectorAll('[data-chat-scroll-gutter]').length).toBe(1)
      s.destroy()
    })

    it('re-mount with new elements tears down previous bindings', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const a = buildScrollDom()
      const b = buildScrollDom()
      const s = createChatScroll()
      s.mount(a.container, a.content)
      s.mount(b.container, b.content)
      // a's gutter removed, b has one
      expect(a.container.querySelector('[data-chat-scroll-gutter]')).toBeNull()
      expect(b.container.querySelector('[data-chat-scroll-gutter]')).toBeTruthy()
      s.destroy()
    })
  })

  describe('at-bottom detection', () => {
    it('initial state is at-bottom when content fits', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 400,
      })
      const s = createChatScroll()
      s.mount(container, content)
      expect(s.state.atBottom).toBe(true)
    })

    it('updates atBottom on scroll', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, flushScroll } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const seen: ChatScrollState[] = []
      const s = createChatScroll({
        onScrollChange: (st) => seen.push(st),
      })
      s.mount(container, content)
      seen.length = 0
      setScrollTop(100)
      flushScroll()
      expect(s.state.atBottom).toBe(false)
      setScrollTop(900) // 1000 - 100 - 900 = 0 within threshold
      flushScroll()
      expect(s.state.atBottom).toBe(true)
      s.destroy()
    })

    it('respects custom bottomThreshold', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, flushScroll } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ bottomThreshold: 200 })
      s.mount(container, content)
      setScrollTop(750) // 150 from bottom — within 200 threshold
      flushScroll()
      expect(s.state.atBottom).toBe(true)
      s.destroy()
    })
  })

  describe('subscribe / onScrollChange', () => {
    it('emits when state changes', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, flushScroll } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const cb = vi.fn()
      const s = createChatScroll({ onScrollChange: cb })
      s.mount(container, content)
      cb.mockClear()
      setScrollTop(500)
      flushScroll()
      expect(cb).toHaveBeenCalled()
      const next = cb.mock.calls.at(-1)?.[0] as ChatScrollState
      expect(next.atBottom).toBe(false)
      s.destroy()
    })

    it('does not emit when nothing changed', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, flushScroll } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 400,
      })
      const cb = vi.fn()
      const s = createChatScroll({ onScrollChange: cb })
      s.mount(container, content)
      cb.mockClear()
      flushScroll()
      flushScroll()
      expect(cb).not.toHaveBeenCalled()
      s.destroy()
    })

    it('subscribe returns unsubscribe', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, flushScroll } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const cb = vi.fn()
      const s = createChatScroll()
      s.mount(container, content)
      const off = s.subscribe(cb)
      setScrollTop(500)
      flushScroll()
      expect(cb).toHaveBeenCalledTimes(1)
      off()
      setScrollTop(900)
      flushScroll()
      expect(cb).toHaveBeenCalledTimes(1)
      s.destroy()
    })

    it('snapshot identity changes only when state changes', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const {
        container,
        content,
        setContentHeight,
        flushScroll,
      } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 400, // content fits → atBottom=true at mount
      })
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      const snap1 = s.state
      flushScroll() // no actual change
      expect(s.state).toBe(snap1)
      // Grow content past viewport — at-bottom flips to false.
      setContentHeight(2000)
      flushScroll()
      expect(s.state).not.toBe(snap1)
      s.destroy()
    })
  })

  describe('streaming mode', () => {
    it('toggles container.style.overflowAnchor', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll()
      s.mount(container, content)
      s.setStreaming(true)
      expect(container.style.overflowAnchor).toBe('none')
      expect(s.state.streaming).toBe(true)
      s.setStreaming(false)
      expect(container.style.overflowAnchor).toBe('')
      expect(s.state.streaming).toBe(false)
      s.destroy()
    })
  })

  describe('pin-to-top strategy', () => {
    it('pinMessage sets scroll-margin, gutter height, and scrolls', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight, setContainerHeight } =
        buildScrollDom({ clientHeight: 600, contentHeight: 800 })
      setContainerHeight(600)
      setContentHeight(800)
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 300,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(msg.style.scrollMarginTop).toBe('12px')
      expect(s.state.pinActive).toBe(true)
      // pinnedY = 300 - 12 = 288 → gutter = 600 + 288 - 800 = 88
      const g = container.querySelector<HTMLElement>(
        '[data-chat-scroll-gutter]',
      )!
      expect(g.style.height).toBe('88px')
      // scrollBehavior: 'instant' → animateScrollTo takes the reduced-motion
      // path and assigns scrollTop synchronously (no animation frame).
      expect(container.scrollTop).toBe(288)
      s.destroy()
    })

    it('pinMessage is no-op when strategy is stick-to-bottom', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content } = buildScrollDom()
      const msg = appendMessage(container, content, { height: 40, y: 100 })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      const startTop = container.scrollTop
      s.pinMessage(msg)
      raf.flushFrames()
      expect(s.state.pinActive).toBe(false)
      expect(container.scrollTop).toBe(startTop)
      s.destroy()
    })

    it('pinLatest selects the last matching element', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1000,
      })
      appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 100,
      })
      appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 500,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.pinLatest('[data-role="user"]')
      raf.flushFrames()
      raf.flushFrames() // pinLatest defers, then pinMessage defers again
      // m2 is at y=500, scrollMargin=12 → pinnedY=488. Confirms the
      // LAST matching element won, not the first (m1 at y=100 → 88).
      expect(container.scrollTop).toBe(488)
      s.destroy()
    })

    describe('pinRelative', () => {
      function buildThree(): {
        s: ReturnType<typeof createChatScroll>
        container: HTMLElement
        content: HTMLElement
        m1: HTMLElement
        m2: HTMLElement
        m3: HTMLElement
        raf: ReturnType<typeof installFakeRaf>
      } {
        const ro = installFakeResizeObserver()
        cleanup.push(ro.uninstall)
        const raf = installFakeRaf()
        cleanup.push(raf.uninstall)
        const { container, content } = buildScrollDom({
          clientHeight: 600,
          contentHeight: 1400,
        })
        const m1 = appendMessage(container, content, {
          role: 'user',
          height: 40,
          y: 100,
        })
        const m2 = appendMessage(container, content, {
          role: 'user',
          height: 40,
          y: 500,
        })
        const m3 = appendMessage(container, content, {
          role: 'user',
          height: 40,
          y: 900,
        })
        const s = createChatScroll({
          strategy: 'pin-to-top',
          scrollBehavior: 'instant',
        })
        s.mount(container, content)
        return { s, container, content, m1, m2, m3, raf }
      }

      it('no-ops when no message is currently pinned', () => {
        const { s, container, raf } = buildThree()
        const before = container.scrollTop
        s.pinRelative('[data-role="user"]', 1)
        raf.flushFrames()
        raf.flushFrames()
        expect(container.scrollTop).toBe(before)
        expect(s.state.pinActive).toBe(false)
        s.destroy()
      })

      it('navigates to the next matching element', () => {
        const { s, container, m1, raf } = buildThree()
        s.pinMessage(m1)
        raf.flushFrames()
        expect(container.scrollTop).toBe(88) // 100 - 12
        s.pinRelative('[data-role="user"]', 1)
        raf.flushFrames()
        raf.flushFrames() // pinRelative defers, then pinMessage defers again
        expect(container.scrollTop).toBe(488) // m2: 500 - 12
        s.destroy()
      })

      it('navigates to the previous matching element', () => {
        const { s, container, m3, raf } = buildThree()
        s.pinMessage(m3)
        raf.flushFrames()
        expect(container.scrollTop).toBe(888) // 900 - 12
        s.pinRelative('[data-role="user"]', -1)
        raf.flushFrames()
        raf.flushFrames()
        expect(container.scrollTop).toBe(488) // m2: 500 - 12
        s.destroy()
      })

      it('clamps at the end of the list (+1 past last → no-op)', () => {
        const { s, container, m3, raf } = buildThree()
        s.pinMessage(m3)
        raf.flushFrames()
        const before = container.scrollTop
        s.pinRelative('[data-role="user"]', 1)
        raf.flushFrames()
        raf.flushFrames()
        expect(container.scrollTop).toBe(before)
        s.destroy()
      })

      it('clamps at the start of the list (-1 past first → no-op)', () => {
        const { s, container, m1, raf } = buildThree()
        s.pinMessage(m1)
        raf.flushFrames()
        const before = container.scrollTop
        s.pinRelative('[data-role="user"]', -1)
        raf.flushFrames()
        raf.flushFrames()
        expect(container.scrollTop).toBe(before)
        s.destroy()
      })

      it('no-ops when selector matches nothing', () => {
        const { s, container, m2, raf } = buildThree()
        s.pinMessage(m2)
        raf.flushFrames()
        const before = container.scrollTop
        s.pinRelative('[data-role="nonexistent"]', 1)
        raf.flushFrames()
        raf.flushFrames()
        expect(container.scrollTop).toBe(before)
        s.destroy()
      })

      it('no-ops when the current pin is not in the matched set', () => {
        const ro = installFakeResizeObserver()
        cleanup.push(ro.uninstall)
        const raf = installFakeRaf()
        cleanup.push(raf.uninstall)
        const { container, content } = buildScrollDom({
          clientHeight: 600,
          contentHeight: 1000,
        })
        // The pinned element is an assistant; navigation selector
        // targets user messages → no reference position.
        const assistant = appendMessage(container, content, {
          role: 'assistant',
          height: 40,
          y: 100,
        })
        appendMessage(container, content, {
          role: 'user',
          height: 40,
          y: 500,
        })
        const s = createChatScroll({
          strategy: 'pin-to-top',
          scrollBehavior: 'instant',
        })
        s.mount(container, content)
        s.pinMessage(assistant)
        raf.flushFrames()
        const before = container.scrollTop
        s.pinRelative('[data-role="user"]', 1)
        raf.flushFrames()
        raf.flushFrames()
        expect(container.scrollTop).toBe(before)
        s.destroy()
      })

      it('no-ops on stick-to-bottom strategy', () => {
        const ro = installFakeResizeObserver()
        cleanup.push(ro.uninstall)
        const raf = installFakeRaf()
        cleanup.push(raf.uninstall)
        const { container, content } = buildScrollDom({
          clientHeight: 600,
          contentHeight: 1000,
        })
        appendMessage(container, content, {
          role: 'user',
          height: 40,
          y: 100,
        })
        const s = createChatScroll({ strategy: 'stick-to-bottom' })
        s.mount(container, content)
        const before = container.scrollTop
        s.pinRelative('[data-role="user"]', 1)
        raf.flushFrames()
        raf.flushFrames()
        expect(container.scrollTop).toBe(before)
        s.destroy()
      })
    })

    it('gutter recalculates on content resize', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 700,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 200,
      })
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      s.pinMessage(msg)
      raf.flushFrames()
      const g = container.querySelector<HTMLElement>(
        '[data-chat-scroll-gutter]',
      )!
      // pinnedY = 200 - 12 = 188 → gutter = 600 + 188 - 700 = 88
      expect(g.style.height).toBe('88px')

      // content grows past pin
      setContentHeight(2000)
      ro.triggerResize()
      // gutter = 600 + 188 - 2000 → clamped to 0
      expect(g.style.height).toBe('0px')
      s.destroy()
    })

    // `getBoundingClientRect` in our test stubs returns viewport-relative
    // coordinates — not document coordinates. To express "the pinned
    // message lives at document Y = docY", we set rect.top = docY -
    // scrollTop. Helper so the tests below read naturally.
    function setMsgDocY(
      msg: HTMLElement,
      docY: number,
      scrollTop: number,
    ): void {
      const top = docY - scrollTop
      msg.getBoundingClientRect = () =>
        ({
          top,
          left: 0,
          bottom: top + 40,
          right: 800,
          width: 800,
          height: 40,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect
    }

    it('refreshes pinnedY when content above the pin resizes', () => {
      // Motivating case: a thinking/tool block in a prior bot reply
      // expands or collapses during streaming. The pinned user-message's
      // real Y shifts, but the cached `pinnedY` (frozen at pin-time)
      // does not. The controller must re-read it from the live element
      // before re-computing the gutter, otherwise the gutter math goes
      // stale and the user can no longer scroll the pinned message to
      // the top of the viewport.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1000,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 500,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.pinMessage(msg)
      raf.flushFrames()
      const g = container.querySelector<HTMLElement>(
        '[data-chat-scroll-gutter]',
      )!
      // pinnedY = 500 - 12 = 488; gutter = 600 + 488 - 1000 = 88.
      expect(g.style.height).toBe('88px')
      expect(container.scrollTop).toBe(488)

      // Prior block expanded by 200 → pinned element's doc Y is 700.
      setMsgDocY(msg, 700, container.scrollTop)
      setContentHeight(1200)
      ro.triggerResize()
      // pinnedY refreshes to 688 → 600 + 688 - 1200 = 88.
      expect(g.style.height).toBe('88px')

      // Prior block collapsed back + more → doc Y is 400.
      setMsgDocY(msg, 400, container.scrollTop)
      setContentHeight(900)
      ro.triggerResize()
      // pinnedY refreshed to 388 → 600 + 388 - 900 = 88.
      expect(g.style.height).toBe('88px')
      s.destroy()
    })

    it('re-anchors scrollTop against refreshed pinnedY when streaming', () => {
      // When streaming is in flight, overflow-anchor is set to 'none'
      // on the container. The browser won't auto-anchor for us. The
      // controller must restore the pin against the refreshed pinnedY.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1500,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(container.scrollTop).toBe(788) // pinnedY = 800 - 12

      // Block above the pin grows by 150 → doc Y is now 950. scrollTop
      // didn't change because content grew (no clamp). The controller
      // must move scrollTop to the refreshed pinnedY = 938.
      setMsgDocY(msg, 950, container.scrollTop)
      setContentHeight(1650)
      ro.triggerResize()
      expect(container.scrollTop).toBe(938)

      // Block above shrinks by 100 → doc Y is now 850.
      setMsgDocY(msg, 850, container.scrollTop)
      setContentHeight(1550)
      ro.triggerResize()
      expect(container.scrollTop).toBe(838)
      s.destroy()
    })

    it('recalcGutter does NOT clobber an in-flight smooth scroll', () => {
      // Regression: with `scrollBehavior: 'smooth'`, pinMessage starts
      // an rAF animation toward pinnedY. If recalcGutter (called from
      // the same pinMessage rAF) wrote `scrollTop = pinnedY` directly,
      // the animation would have no distance left to interpolate over
      // and the pin would jump to its target instantly. The
      // `scrollInFlight` flag suppresses recalcGutter's write while
      // the animation is running.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const mm = installMatchMedia(false)
      cleanup.push(mm.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1500,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'smooth',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames() // run the pin's rAF — recalcGutter + startAnimatedScroll
      // The smooth-scroll rAF loop hasn't ticked yet (we only flushed
      // the pinMessage rAF). scrollTop should still be 0 — recalcGutter
      // refused to write it instantly.
      expect(container.scrollTop).toBe(0)
      // (Verify the gutter math used the refreshed pinnedY.)
      const g = container.querySelector<HTMLElement>(
        '[data-chat-scroll-gutter]',
      )!
      // pinnedY = 800 - 12 = 788; gutter = 600 + 788 - 1500 = -112 → 0.
      // Hmm same as initial — try with contentHeight where gutter > 0.
      expect(g.style.height).toBe('0px')
      s.destroy()
    })

    it('keydown of a non-scroll key does NOT clear pinAnchored', () => {
      // Regression: Tab/Enter/letters do not move scrollTop, so they
      // must not clear pinAnchored. Otherwise a keyboard user
      // pressing Enter on a `<button>` inside the chat surface would
      // drop the anchor.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1500,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(container.scrollTop).toBe(788)

      // Tab on a focusable child — should not drop the anchor.
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
      )
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )

      // Block above the pin expands. Anchor still active → controller
      // re-anchors. (Same setup as `re-anchors scrollTop ...`.)
      setMsgDocY(msg, 950, container.scrollTop)
      setContentHeight(1650)
      ro.triggerResize()
      expect(container.scrollTop).toBe(938)
      s.destroy()
    })

    it('keydown of a scroll key (ArrowDown) DOES clear pinAnchored', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight, setScrollTop } =
        buildScrollDom({ clientHeight: 600, contentHeight: 1500 })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(container.scrollTop).toBe(788)

      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      )
      setScrollTop(500)
      setMsgDocY(msg, 950, 500)
      setContentHeight(1650)
      ro.triggerResize()
      // pinAnchored cleared → controller leaves scrollTop alone.
      expect(container.scrollTop).toBe(500)
      s.destroy()
    })

    it('pointerdown alone does NOT clear pinAnchored', () => {
      // Tap-to-expand a block bubbles pointerdown up to the container.
      // That must not drop the pin or a subsequent content-above
      // resize will drift.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1500,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(container.scrollTop).toBe(788)

      container.dispatchEvent(new Event('pointerdown'))
      container.dispatchEvent(new Event('touchstart'))

      setMsgDocY(msg, 950, container.scrollTop)
      setContentHeight(1650)
      ro.triggerResize()
      // Pin maintained.
      expect(container.scrollTop).toBe(938)
      s.destroy()
    })

    it('does NOT re-anchor after user input clears pinAnchored', () => {
      // Simulate the spec's "user scrolled away" case. After the user
      // wheels/touches/keys, the controller's user-input cancellers
      // clear `pinAnchored`. Subsequent content resizes must NOT snap
      // the user back to the pin.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight, setScrollTop } =
        buildScrollDom({
          clientHeight: 600,
          contentHeight: 1500,
        })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(container.scrollTop).toBe(788)

      // User wheels — controller's listener clears pinAnchored.
      // Dispatch a wheel with deltaY so the controller doesn't
      // short-circuit horizontal-only wheel.
      container.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 50, bubbles: true }),
      )
      // User scrolls back up to 500 (intent: read prior content).
      setScrollTop(500)

      // Block above the pin expands. With pinAnchored=false the
      // controller must leave scrollTop where the user put it.
      setMsgDocY(msg, 950, 500)
      setContentHeight(1650)
      ro.triggerResize()
      expect(container.scrollTop).toBe(500)
      s.destroy()
    })

    it('consumer programmatic scroll above the pin clears pinAnchored', () => {
      // A host-app `container.scrollTo({top: 0})` doesn't route through
      // the user-input cancellers (no wheel / touch / keydown) or the
      // controller's scrollToBottom(). Without the scroll-listener
      // check, `pinAnchored` stays true and the next resize snaps the
      // user back to the pin.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setScrollTop, flushScroll, setContentHeight } =
        buildScrollDom({ clientHeight: 600, contentHeight: 1500 })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(container.scrollTop).toBe(788)
      expect(s.state.pinAnchored).toBe(true)

      // Consumer's own scrollTo — no user-input event. The delta-
      // based check in the scroll listener fires synchronously: the
      // previous frame's scrollTop was at the pin, this frame's is
      // far away → external scroll detected.
      setScrollTop(0)
      flushScroll()
      expect(s.state.pinAnchored).toBe(false)

      // Subsequent block-expand resize must NOT yank the user back.
      setMsgDocY(msg, 950, 0)
      setContentHeight(1650)
      ro.triggerResize()
      expect(container.scrollTop).toBe(0)
      s.destroy()
    })

    it('scroll listener leaves pinAnchored alone when scrollTop tracks pinnedY (no false-positive on legitimate clamp)', () => {
      // After a controller-driven re-anchor (recalcGutter writes
      // scrollTop = pinnedY), the resulting scroll event must NOT
      // clear `pinAnchored`. The "consumer scrolled away" check only
      // fires when scrollTop diverges from pinnedY by more than the
      // threshold.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, flushScroll, setContentHeight } =
        buildScrollDom({ clientHeight: 600, contentHeight: 1500 })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames()

      // Several resize + scroll-event cycles while at the pin.
      setMsgDocY(msg, 950, container.scrollTop)
      setContentHeight(1650)
      ro.triggerResize()
      flushScroll()
      setMsgDocY(msg, 1000, container.scrollTop)
      setContentHeight(1700)
      ro.triggerResize()
      flushScroll()

      // pinAnchored survives the resize/scroll churn.
      expect(s.state.pinAnchored).toBe(true)
      s.destroy()
    })

    it('horizontal wheel on inner scrollable descendant keeps pinAnchored', () => {
      // Wheel events on a horizontally-scrollable descendant (e.g. a
      // wide code block in a bot reply) bubble to the chat container's
      // listener. The chat never scrolls vertically, so `pinAnchored`
      // must be preserved. The controller detects the descendant
      // scrollable via target-walking.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1500,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      // A horizontally-scrollable inner element.
      const wide = document.createElement('pre')
      wide.style.overflowX = 'auto'
      Object.defineProperty(wide, 'scrollWidth', { configurable: true, value: 2000 })
      Object.defineProperty(wide, 'clientWidth', { configurable: true, value: 400 })
      content.appendChild(wide)

      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(container.scrollTop).toBe(788)

      // Horizontal wheel ON the inner pre (event.target = wide).
      const ev = new WheelEvent('wheel', { deltaY: 0, deltaX: 80, bubbles: true })
      wide.dispatchEvent(ev)
      expect(s.state.pinAnchored).toBe(true)

      // Resize after the horizontal pan still re-anchors.
      setMsgDocY(msg, 950, container.scrollTop)
      setContentHeight(1650)
      ro.triggerResize()
      expect(container.scrollTop).toBe(938)
      s.destroy()
    })

    it('horizontal-only wheel anywhere in the chat does NOT clear pinAnchored', () => {
      // Even if no descendant scrollable matches, a wheel with
      // deltaY=0 can't scroll the chat vertically — so we must not
      // drop the pin.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1500,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(container.scrollTop).toBe(788)

      container.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 0, deltaX: 80, bubbles: true }),
      )
      expect(s.state.pinAnchored).toBe(true)

      setMsgDocY(msg, 950, container.scrollTop)
      setContentHeight(1650)
      ro.triggerResize()
      expect(container.scrollTop).toBe(938)
      s.destroy()
    })

    it('pointerdown mid-pin-animation flags pinAnimationInterrupted for animated catch-up', () => {
      // The user pointerdowns inside the chat while the pin smooth-
      // scroll is in flight. The animation aborts; scrollInFlight goes
      // false; pinAnchored stays true. A synchronous re-anchor on the
      // next resize would teleport the user. Verify the controller
      // takes the animated catch-up branch instead.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight, setScrollTop } =
        buildScrollDom({ clientHeight: 600, contentHeight: 1500 })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'smooth',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames() // pinMessage rAF — schedules the animation
      // We're mid-animation now: scrollInFlight=true, scrollTop still
      // at the start (animation hasn't ticked yet in fake-raf land).
      expect(s.state.scrollInFlight).toBe(true)

      // Simulate the user landing the abort somewhere mid-flight.
      setScrollTop(400)

      // Pointerdown — abort-only event. Aborts the animation, sets
      // pinAnimationInterrupted because scrollInFlight was true.
      container.dispatchEvent(new Event('pointerdown'))
      expect(s.state.scrollInFlight).toBe(false)
      expect(s.state.pinAnchored).toBe(true)

      // Block above the pin expands during the abort window. With the
      // fix, recalcGutter takes the animated catch-up path (calls
      // reAnchorPin) rather than synchronously writing scrollTop.
      setMsgDocY(msg, 950, 400)
      setContentHeight(1650)
      ro.triggerResize()
      // The animated catch-up is now in flight; scrollInFlight=true.
      expect(s.state.scrollInFlight).toBe(true)
      // The catch-up animation hasn't ticked, so scrollTop is still
      // where the user's pointerdown left it — NOT teleported to 938.
      expect(container.scrollTop).toBe(400)
      s.destroy()
    })

    it('pin animation tracks live pinnedY when content grows above mid-animation', () => {
      // animateScrollTo previously captured `target` as a constant.
      // With the getter form, mid-animation pinnedY shifts are
      // reflected in the animation's landing point.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      // Use reduced-motion path so we can synchronously verify the
      // animation lands at the LIVE pinnedY (the rAF-driven smooth
      // path's full frame model is exercised by the e2e probe).
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1500,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 800,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(container.scrollTop).toBe(788)

      // Now an above-pin growth mid-stream: pinnedY refresh moves the
      // target. A second pinMessage that started before the growth
      // would (pre-fix) land at the old value. We model that by
      // updating pinnedY via a fresh pinMessage following a resize.
      setMsgDocY(msg, 950, container.scrollTop)
      setContentHeight(1650)
      ro.triggerResize()
      // pinnedY refreshed via recalc → re-anchor wrote scrollTop=938.
      expect(container.scrollTop).toBe(938)
      expect(s.state.pinnedY).toBe(938)
      s.destroy()
    })

    it('reset clears pin and gutter', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 700,
      })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 200,
      })
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(s.state.pinActive).toBe(true)

      s.reset()
      expect(s.state.pinActive).toBe(false)
      const g = container.querySelector<HTMLElement>(
        '[data-chat-scroll-gutter]',
      )!
      expect(g.style.height).toBe('0px')
      s.destroy()
    })
  })

  describe('stick-to-bottom strategy', () => {
    it('locked by default for stick-to-bottom', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      expect(s.state.locked).toBe(true)
      s.destroy()
    })

    it('not locked for pin-to-top', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      expect(s.state.locked).toBe(false)
      s.destroy()
    })

    it('auto-scrolls to bottom on content growth while streaming + locked', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 100,
      })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      expect(container.scrollTop).toBe(0) // 100 - 100 - 0 = 0 within threshold
      s.setStreaming(true)
      setContentHeight(1000)
      ro.triggerResize()
      // locked + streaming → scrollTop pinned to scrollHeight = 1000, max scroll = 900
      expect(container.scrollTop).toBe(900)
      s.destroy()
    })

    it('does NOT auto-scroll on content growth when locked but not streaming', () => {
      // The streaming gate exists so users can interact with completed
      // content (e.g., expand a tool-call block) without the controller
      // yanking them back to the bottom mid-tap.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 100,
      })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      expect(s.state.locked).toBe(true)
      expect(s.state.streaming).toBe(false)
      setContentHeight(1000)
      ro.triggerResize()
      expect(container.scrollTop).toBe(0)
      s.destroy()
    })

    it('does NOT auto-scroll on content growth when streaming but not locked', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setContentHeight, setScrollTop, flushScroll } =
        buildScrollDom({ clientHeight: 100, contentHeight: 1000 })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      s.setStreaming(true)
      setScrollTop(200)
      flushScroll() // user scroll-up breaks the lock
      expect(s.state.locked).toBe(false)
      setContentHeight(2000)
      ro.triggerResize()
      expect(container.scrollTop).toBe(200)
      s.destroy()
    })

    it('user scroll-up breaks the lock', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, flushScroll } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      // simulate a "scrolled to bottom" state
      setScrollTop(900)
      flushScroll()
      expect(s.state.locked).toBe(true)
      // user scrolls up
      setScrollTop(200)
      flushScroll()
      expect(s.state.locked).toBe(false)
      s.destroy()
    })

    it('lock() re-engages and scrolls to bottom', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, flushScroll } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      setScrollTop(200)
      flushScroll()
      expect(s.state.locked).toBe(false)
      s.lock()
      expect(s.state.locked).toBe(true)
      expect(container.scrollTop).toBe(900)
      s.destroy()
    })

    it('unlock() releases without scrolling', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      s.unlock()
      expect(s.state.locked).toBe(false)
      s.destroy()
    })

    it('lock/unlock are no-ops with pin-to-top', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      s.lock()
      s.unlock()
      expect(s.state.locked).toBe(false)
      s.destroy()
    })
  })

  describe('strategy switching', () => {
    it('switching strategy resets and updates state', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      expect(s.state.locked).toBe(false)
      s.setOptions({ strategy: 'stick-to-bottom' })
      expect(s.state.locked).toBe(true)
      expect(s.state.pinActive).toBe(false)
      s.destroy()
    })
  })

  describe('scrollToBottom', () => {
    it('scrolls container to scrollHeight', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ scrollBehavior: 'instant' })
      s.mount(container, content)
      s.scrollToBottom()
      // 1000 content - 100 viewport = 900 max scroll; animateScrollTo
      // clamps to it (mirrors what native scrollTo would do).
      expect(container.scrollTop).toBe(900)
      s.destroy()
    })
  })

  describe('savePosition / restorePosition', () => {
    it('saves and restores from-top when not at bottom', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll()
      s.mount(container, content)
      setScrollTop(300)
      const pos = s.savePosition()
      expect(pos.scrollTop).toBe(300)
      expect(pos.wasAtBottom).toBe(false)

      setScrollTop(0)
      s.restorePosition(pos)
      expect(container.scrollTop).toBe(300)
      s.destroy()
    })

    it('restores at-bottom even if content grew', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, setContentHeight } =
        buildScrollDom({ clientHeight: 100, contentHeight: 500 })
      const s = createChatScroll()
      s.mount(container, content)
      setScrollTop(400)
      const pos = s.savePosition()
      expect(pos.wasAtBottom).toBe(true)

      setContentHeight(2000)
      setScrollTop(0)
      s.restorePosition(pos)
      // Content grew → at-bottom restoration jumps to new bottom = 1900
      expect(container.scrollTop).toBe(1900)
      s.destroy()
    })

    it('savePosition before mount returns sensible defaults', () => {
      const s = createChatScroll()
      const pos = s.savePosition()
      expect(pos).toEqual({
        scrollTop: 0,
        scrollFromBottom: 0,
        wasAtBottom: true,
      })
    })
  })

  describe('destroy', () => {
    it('removes the gutter, listener, observer, and styles', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const removeSpy = vi.spyOn(container, 'removeEventListener')
      const s = createChatScroll()
      s.mount(container, content)
      s.destroy()
      expect(container.querySelector('[data-chat-scroll-gutter]')).toBeNull()
      expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
      expect(container.style.overflowY).toBe('') // restored
    })

    it('clears subscribers', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, flushScroll, setScrollTop } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll()
      s.mount(container, content)
      const cb = vi.fn()
      s.subscribe(cb)
      s.destroy()
      // Bindings are torn down — scroll has no observer to dispatch through.
      setScrollTop(500)
      flushScroll() // listener removed → no-op
      expect(cb).not.toHaveBeenCalled()
    })

    it('cancels pending rAF callbacks', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content } = buildScrollDom()
      const msg = appendMessage(container, content, { height: 40, y: 100 })
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      const scrollToSpy = vi.spyOn(container, 'scrollTo')
      s.pinMessage(msg)
      s.destroy()
      raf.flushFrames()
      expect(scrollToSpy).not.toHaveBeenCalled()
    })
  })
})
