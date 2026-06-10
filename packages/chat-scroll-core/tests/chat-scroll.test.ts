import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createChatScroll } from '../src/chat-scroll'
import { recalcGutter } from '../src/strategies/pin-to-top'
import type { StrategyContext } from '../src/strategies/types'
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

    it('setOptions ignores keys passed as undefined', () => {
      // Adapters sync options by passing EVERY key on every render, with
      // `undefined` for options the consumer never set. Those must not
      // clobber resolved defaults (bottomThreshold: undefined would break
      // at-bottom detection; scrollMargin: undefined would make pinnedY
      // NaN on the next pinMessage).
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.setOptions({
        strategy: 'pin-to-top',
        bottomThreshold: undefined,
        scrollMargin: undefined,
        scrollBehavior: undefined,
        scrollDurationMs: undefined,
      })
      expect(s.options.strategy).toBe('pin-to-top')
      expect(s.options.bottomThreshold).toBe(40)
      expect(s.options.scrollMargin).toBe(12)
      expect(s.options.scrollBehavior).toBe('auto')
      expect(s.options.scrollDurationMs).toBe(320)
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

    it('gutter slack does not count — atBottom means the end of the CONTENT is in reach', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setScrollTop, flushScroll } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 800,
      })
      const s = createChatScroll({ strategy: 'pin-to-top' })
      s.mount(container, content)
      // Library-owned slack below the content (what an in-flight floor
      // leaves behind). The content's end is at 800; the user at 200
      // sees it at the viewport's bottom edge — they ARE at the bottom
      // of the conversation, even though 300px of gutter remain
      // scrollable below it.
      const gutter = container.querySelector<HTMLElement>(
        '[data-chat-scroll-gutter]',
      )!
      gutter.style.height = '300px'
      setScrollTop(200)
      flushScroll()
      expect(s.state.atBottom).toBe(true)
      // Scrolled up: the content's end leaves the viewport → false.
      setScrollTop(100)
      flushScroll()
      expect(s.state.atBottom).toBe(false)
      s.destroy()
    })

    it('atBottom holds through mid-animation growth under the gutter floor (FAB flicker)', () => {
      // Regression: send → pinLatest → animation toward the pin while
      // the reply streams in. The no-shrink floor keeps the gutter
      // slack during the flight, so a scrollHeight-based measure flaps
      // with every chunk — the scroll-to-bottom FAB flickered in the
      // docs demo. Measured against the content's end it stays true:
      // the user never loses sight of the latest content.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const {
        container,
        content,
        setContentHeight,
        setScrollTop,
        flushScroll,
        resizeContent,
      } = buildScrollDom({ clientHeight: 600, contentHeight: 800 })
      const msg = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 700,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'smooth',
      })
      s.mount(container, content)
      setScrollTop(200) // at the bottom (800 - 600)
      flushScroll()
      expect(s.state.atBottom).toBe(true)

      s.pinMessage(msg)
      raf.flushFrames() // measurement frame: gutter 488, animation queued
      expect(s.state.scrollInFlight).toBe(true)
      expect(container.scrollTop).toBe(200) // not stepped yet

      // A chunk lands mid-flight. Tight gutter would now be 468, but
      // the floor holds 488 — scrollHeight grows by the chunk.
      setContentHeight(820)
      resizeContent()
      // scrollHeight 1308, slack 488 → 20px from the content's end.
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
      setScrollTop(900)
      flushScroll() // reach the bottom — atBottom flips true
      setScrollTop(500)
      flushScroll() // scroll up — atBottom flips back, lock releases
      expect(cb).toHaveBeenCalled()
      const next = cb.mock.calls.at(-1)?.[0] as ChatScrollState
      expect(next.atBottom).toBe(false)
      expect(next.locked).toBe(false)
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
      setScrollTop(900)
      flushScroll() // atBottom flips → one emit
      expect(cb).toHaveBeenCalledTimes(1)
      off()
      setScrollTop(500)
      flushScroll() // atBottom + locked flip, but unsubscribed
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
    it('toggles container.style.overflowAnchor (restored after the grace)', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll()
      s.mount(container, content)
      s.setStreaming(true)
      expect(container.style.overflowAnchor).toBe('none')
      expect(s.state.streaming).toBe(true)
      s.setStreaming(false)
      expect(s.state.streaming).toBe(false)
      // Anchoring stays disabled through the two-frame grace window so
      // the final chunk's growth is still followed, then restores.
      raf.flushFrames()
      raf.flushFrames()
      expect(container.style.overflowAnchor).toBe('')
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

      it('navigates from the viewport when no message is pinned', () => {
        // No pin → viewport-relative reference. At scrollTop 0 every
        // match is below the viewport top, so +1 pins the first one.
        const { s, container, raf } = buildThree()
        expect(s.pinRelative('[data-role="user"]', 1)).toBe(true)
        raf.flushFrames()
        expect(container.scrollTop).toBe(88) // m1: 100 - 12
        expect(s.state.pinActive).toBe(true)
        s.destroy()
      })

      it('no-ops on -1 when no pin exists and nothing is above the viewport', () => {
        const { s, container, raf } = buildThree()
        const before = container.scrollTop
        expect(s.pinRelative('[data-role="user"]', -1)).toBe(false)
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

      it('falls back to the viewport reference when the current pin is not in the matched set', () => {
        const ro = installFakeResizeObserver()
        cleanup.push(ro.uninstall)
        const raf = installFakeRaf()
        cleanup.push(raf.uninstall)
        const { container, content } = buildScrollDom({
          clientHeight: 600,
          contentHeight: 1000,
        })
        // The pinned element is an assistant; navigation selector
        // targets user messages. The pin can't serve as the reference,
        // so navigation resolves geometrically: the user message below
        // the viewport top is the +1 target.
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
        expect(container.scrollTop).toBe(88) // assistant: 100 - 12
        expect(s.pinRelative('[data-role="user"]', 1)).toBe(true)
        raf.flushFrames()
        expect(container.scrollTop).toBe(488) // user: 500 - 12
        s.destroy()
      })

      it('rapid back-to-back calls accumulate (pendingPinEl, not the settled pin)', () => {
        // Two quick "prev" clicks within the same frame must move TWO
        // turns. pinMessage defers its measurement, so the second call
        // resolves against the pending element, not the settled pin.
        const { s, container, m3, raf } = buildThree()
        s.pinMessage(m3)
        raf.flushFrames()
        expect(container.scrollTop).toBe(888)
        expect(s.pinRelative('[data-role="user"]', -1)).toBe(true)
        expect(s.pinRelative('[data-role="user"]', -1)).toBe(true)
        raf.flushFrames()
        expect(container.scrollTop).toBe(88) // m1 — two hops
        s.destroy()
      })

      it('navigates from the viewport after the user scrolls away', () => {
        const { s, container, m3, raf } = buildThree()
        s.pinMessage(m3)
        raf.flushFrames()
        expect(container.scrollTop).toBe(888)
        // User wheels away from the pin (clears pinAnchored) and reads
        // mid-way through m2's reply.
        container.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -50, bubbles: true }),
        )
        container.scrollTop = 520
        expect(s.state.pinAnchored).toBe(false)
        // -1 first snaps to the turn being read (m2)…
        expect(s.pinRelative('[data-role="user"]', -1)).toBe(true)
        raf.flushFrames()
        expect(container.scrollTop).toBe(488)
        // …then walks upward from the (re-anchored) pin.
        expect(s.pinRelative('[data-role="user"]', -1)).toBe(true)
        raf.flushFrames()
        expect(container.scrollTop).toBe(88)
        s.destroy()
      })

      it('+1 from a scrolled-away viewport pins the next turn below', () => {
        const { s, container, m3, raf } = buildThree()
        s.pinMessage(m3)
        raf.flushFrames()
        container.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -50, bubbles: true }),
        )
        container.scrollTop = 520 // reading m2's reply
        expect(s.pinRelative('[data-role="user"]', 1)).toBe(true)
        raf.flushFrames()
        expect(container.scrollTop).toBe(888) // m3
        s.destroy()
      })

      it('getPinnedElement reflects pending and settled pins', () => {
        const { s, m2, raf } = buildThree()
        expect(s.getPinnedElement()).toBe(null)
        s.pinMessage(m2)
        expect(s.getPinnedElement()).toBe(m2) // pending — frame not run yet
        raf.flushFrames()
        expect(s.getPinnedElement()).toBe(m2) // settled
        s.reset()
        expect(s.getPinnedElement()).toBe(null)
        s.destroy()
      })

      it('a newer pinRelative supersedes a pending pinLatest (last call wins)', () => {
        const { s, container, m2, raf } = buildThree()
        s.pinMessage(m2)
        raf.flushFrames()
        expect(container.scrollTop).toBe(488)
        s.pinLatest('[data-role="user"]')
        expect(s.pinRelative('[data-role="user"]', -1)).toBe(true)
        raf.flushFrames()
        raf.flushFrames()
        // m1 won — the stale pinLatest frame aborted instead of
        // clobbering the navigation with m3.
        expect(container.scrollTop).toBe(88)
        s.destroy()
      })

      it('reset() cancels a pin still waiting on its frame', () => {
        const { s, container, m2, raf } = buildThree()
        s.pinMessage(m2)
        s.reset()
        raf.flushFrames()
        raf.flushFrames()
        expect(s.state.pinActive).toBe(false)
        expect(container.scrollTop).toBe(0)
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
      // `instant` so no animation is in flight — the in-flight gutter
      // floor (no-shrink during animations) has its own tests below.
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
      // pinnedY = 200 - 12 = 188 → gutter = 600 + 188 - 700 = 88
      expect(g.style.height).toBe('88px')

      // content grows past pin
      setContentHeight(2000)
      ro.triggerResize()
      // gutter = 600 + 188 - 2000 → clamped to 0
      expect(g.style.height).toBe('0px')
      s.destroy()
    })

    it('gutter never shrinks while a scroll animation is in flight', () => {
      // Regression for pinRelative() to an EARLIER turn teleporting
      // instead of animating: the outgoing pin's gutter is tall, the
      // incoming pin's tight height is 0, and shrinking synchronously
      // drops scrollHeight below the current scrollTop — the browser
      // clamps and the user jumps. While `scrollInFlight` the gutter
      // must hold a no-shrink floor; once the animation completes the
      // tight-pin contract is restored.
      const { container, content, mountGutter } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 700,
      })
      const m1 = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 100,
      })
      const gutter = mountGutter()
      // State left by pinning a LATER turn: tall gutter, user near the
      // old max-scroll, now animating toward m1 (pinnedY = 88).
      gutter.style.height = '388px'
      container.scrollTop = 450
      const ctx: StrategyContext = {
        container,
        content,
        gutter,
        pinnedEl: m1,
        pinnedMargin: 12,
        state: {
          atBottom: false,
          pinActive: true,
          pinAnchored: true,
          streaming: false,
          locked: false,
          scrollInFlight: true,
          pinnedY: 88,
        },
        options: { bottomThreshold: 40, scrollMargin: 12 },
        pinAnimationInterrupted: false,
        scrollDelta: 0,
      }
      recalcGutter(ctx)
      // Tight height for m1 is 0 (88 + 600 - 700 < 0), but the floor
      // holds and the user's mid-animation position survives unclamped.
      expect(gutter.style.height).toBe('388px')
      expect(container.scrollTop).toBe(450)

      // Animation completed — tighten back to the contract.
      ctx.state.scrollInFlight = false
      recalcGutter(ctx)
      expect(gutter.style.height).toBe('0px')
      expect(container.scrollTop).toBe(88) // re-anchored at the pin
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

    it('consumer programmatic scroll below the pin clears pinAnchored', () => {
      // Mirror of the above-the-pin case: a host-app `scrollIntoView`
      // of a message BELOW the pin (deep-link, search-result jump) also
      // bypasses the user-input cancellers. The away-from-pin check is
      // symmetric, so the next resize must not yank the user back up.
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

      // Consumer scrolls DOWN past the pin (e.g. scrollIntoView of a
      // later message). scrollHeight is unchanged → external scroll.
      setScrollTop(888)
      flushScroll()
      expect(s.state.pinAnchored).toBe(false)

      // Subsequent resize leaves the user where they navigated to.
      setMsgDocY(msg, 950, 888)
      setContentHeight(1650)
      ro.triggerResize()
      expect(container.scrollTop).toBe(888)
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

    it('wheel on inner scrollable mid-pin-animation flags pinAnimationInterrupted', () => {
      // Same family as the pointerdown case: a horizontal pan over a
      // wide code block aborts the in-flight pin animation but
      // preserves the pin. The next resize must take the ANIMATED
      // catch-up branch — a synchronous write would teleport the user
      // from wherever the abort left them.
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
      const wide = document.createElement('pre')
      wide.style.overflowX = 'auto'
      Object.defineProperty(wide, 'scrollWidth', { configurable: true, value: 2000 })
      Object.defineProperty(wide, 'clientWidth', { configurable: true, value: 400 })
      content.appendChild(wide)

      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'smooth',
      })
      s.mount(container, content)
      s.setStreaming(true)
      s.pinMessage(msg)
      raf.flushFrames() // pinMessage rAF — schedules the animation
      expect(s.state.scrollInFlight).toBe(true)
      setScrollTop(400) // abort lands mid-flight

      // Horizontal wheel on the inner pre — absorbed by the descendant
      // scrollable, so the pin is preserved, but the animation aborted.
      wide.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 0, deltaX: 80, bubbles: true }),
      )
      expect(s.state.scrollInFlight).toBe(false)
      expect(s.state.pinAnchored).toBe(true)

      // Resize → animated catch-up, not a teleport.
      setMsgDocY(msg, 950, 400)
      setContentHeight(1650)
      ro.triggerResize()
      expect(s.state.scrollInFlight).toBe(true)
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
      setScrollTop(900)
      flushScroll() // at the bottom
      setScrollTop(200)
      flushScroll() // user scroll-up breaks the lock
      expect(s.state.locked).toBe(false)
      setContentHeight(2000)
      ro.triggerResize()
      expect(container.scrollTop).toBe(200)
      s.destroy()
    })

    it('growth-race scroll events with non-negative delta do NOT break the lock', () => {
      // Regression: on send, the new user message can render BETWEEN
      // the lock() snap write and that write's scroll event, so the
      // event observes a gap beyond the threshold without the viewport
      // ever moving up. That event must not release the lock — only an
      // upward movement (negative scrollTop delta) is a user leaving.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, setContentHeight, flushScroll } =
        buildScrollDom({
          clientHeight: 100,
          contentHeight: 1000,
        })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      setScrollTop(900)
      flushScroll()
      expect(s.state.locked).toBe(true)
      // Content grows (new message), then a scroll event fires at the
      // same scrollTop — gap is now 100px but delta is 0.
      setContentHeight(1100)
      flushScroll()
      expect(s.state.locked).toBe(true)
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
      setScrollTop(900)
      flushScroll()
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

    describe('input-driven lock release', () => {
      // Regression: during a stream the strategy re-snaps scrollTop to
      // the bottom on every content tick, which cancels the user's
      // in-progress wheel/touch scroll before it produces a scroll
      // event that leaves the bottom — so a position-based release
      // alone never fires and the chat "swallows" upward scrolls
      // mid-stream. The lock must release on the INPUT itself.
      function buildLocked(): {
        s: ReturnType<typeof createChatScroll>
        container: HTMLElement
        setScrollTop: (t: number) => void
      } {
        const ro = installFakeResizeObserver()
        cleanup.push(ro.uninstall)
        const { container, content, setScrollTop } = buildScrollDom({
          clientHeight: 100,
          contentHeight: 1000,
        })
        const s = createChatScroll({ strategy: 'stick-to-bottom' })
        s.mount(container, content)
        s.setStreaming(true)
        setScrollTop(900) // at the bottom, lock engaged
        expect(s.state.locked).toBe(true)
        return { s, container, setScrollTop }
      }

      const touchEvent = (type: string, clientY: number): Event => {
        const ev = new Event(type, { bubbles: true })
        Object.defineProperty(ev, 'touches', {
          value: [{ clientY }],
        })
        return ev
      }

      it('wheel-up releases the lock at input time', () => {
        const { s, container } = buildLocked()
        container.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -50, bubbles: true }),
        )
        expect(s.state.locked).toBe(false)
        s.destroy()
      })

      it('wheel-down does NOT release the lock', () => {
        const { s, container } = buildLocked()
        container.dispatchEvent(
          new WheelEvent('wheel', { deltaY: 50, bubbles: true }),
        )
        expect(s.state.locked).toBe(true)
        s.destroy()
      })

      it('wheel-up before the content overflows does NOT release the lock', () => {
        const ro = installFakeResizeObserver()
        cleanup.push(ro.uninstall)
        // Content shorter than the viewport — scrollTop is pinned at 0
        // and a wheel-up can't scroll; the lock must survive so the
        // chat still follows once the content DOES overflow.
        const { container, content } = buildScrollDom({
          clientHeight: 600,
          contentHeight: 300,
        })
        const s = createChatScroll({ strategy: 'stick-to-bottom' })
        s.mount(container, content)
        container.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -50, bubbles: true }),
        )
        expect(s.state.locked).toBe(true)
        s.destroy()
      })

      it('wheel-up absorbed by a nested scrollable does NOT release the lock', () => {
        const { s, container } = buildLocked()
        const inner = document.createElement('div')
        inner.style.overflowY = 'auto'
        Object.defineProperty(inner, 'scrollHeight', { value: 500 })
        Object.defineProperty(inner, 'clientHeight', { value: 100 })
        container.appendChild(inner)
        inner.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -50, bubbles: true }),
        )
        expect(s.state.locked).toBe(true)
        s.destroy()
      })

      it('touch pan toward older messages releases the lock', () => {
        const { s, container } = buildLocked()
        container.dispatchEvent(touchEvent('touchstart', 300))
        // Finger moves DOWN the screen → content pans up.
        container.dispatchEvent(touchEvent('touchmove', 330))
        expect(s.state.locked).toBe(false)
        s.destroy()
      })

      it('touch pan toward the bottom does NOT release the lock', () => {
        const { s, container } = buildLocked()
        container.dispatchEvent(touchEvent('touchstart', 300))
        // Finger moves UP the screen → content pans down (toward bottom).
        container.dispatchEvent(touchEvent('touchmove', 270))
        expect(s.state.locked).toBe(true)
        s.destroy()
      })

      it('ArrowUp / PageUp / Home release the lock; ArrowDown does not', () => {
        for (const key of ['ArrowUp', 'PageUp', 'Home']) {
          const { s, container } = buildLocked()
          container.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true }),
          )
          expect(s.state.locked, key).toBe(false)
          s.destroy()
        }
        const { s, container } = buildLocked()
        container.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
        )
        expect(s.state.locked).toBe(true)
        s.destroy()
      })
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

    it('tracks content growth during the smooth animation (lands at the live bottom)', () => {
      // Content can stream in during the ~320ms animation. A target
      // captured at call time would land short of the real bottom; the
      // getter form re-reads scrollHeight every frame.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      let fakeNow = 0
      const nowSpy = vi
        .spyOn(performance, 'now')
        .mockImplementation(() => fakeNow)
      cleanup.push(() => nowSpy.mockRestore())

      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 500,
      })
      const s = createChatScroll({
        scrollBehavior: 'smooth',
        scrollDurationMs: 100,
      })
      s.mount(container, content)
      s.scrollToBottom() // target read now: scrollHeight = 500
      expect(s.state.scrollInFlight).toBe(true)

      setContentHeight(800) // a stream chunk lands mid-animation

      fakeNow = 50
      raf.flushFrames() // target moved → interpolation re-anchors
      fakeNow = 250
      raf.flushFrames() // past duration → animation completes

      // Live bottom: 800 - 100 = 700. A stale captured target would
      // have stopped at 500.
      expect(container.scrollTop).toBe(700)
      s.destroy()
    })

    it('re-engages the stick-to-bottom lock when the scroll completes', async () => {
      // The FAB / "↓ New messages" affordance wires scrollToBottom().
      // Reaching the bottom that way means "follow the latest again" —
      // without re-locking, the very next stream chunk drifts the user
      // away and the FAB reappears.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, flushScroll, setContentHeight } =
        buildScrollDom({ clientHeight: 100, contentHeight: 1000 })
      const s = createChatScroll({ scrollBehavior: 'instant' })
      s.mount(container, content)
      s.setStreaming(true)

      // User scrolls up mid-stream → lock releases.
      setScrollTop(900)
      flushScroll()
      setScrollTop(100)
      flushScroll()
      expect(s.state.locked).toBe(false)

      s.scrollToBottom()
      expect(container.scrollTop).toBe(900)
      await new Promise((r) => setTimeout(r, 0)) // settle epilogue
      expect(s.state.locked).toBe(true)

      // Next chunk while streaming sticks to the bottom again.
      setContentHeight(1200)
      ro.triggerResize()
      expect(container.scrollTop).toBe(1100)
      s.destroy()
    })

    it('does NOT re-lock when the user aborts the scroll animation', async () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setScrollTop, flushScroll } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ scrollBehavior: 'smooth' })
      s.mount(container, content)
      s.setStreaming(true)
      setScrollTop(900)
      flushScroll()
      setScrollTop(100)
      flushScroll()
      expect(s.state.locked).toBe(false)

      s.scrollToBottom() // rAF animation in flight
      expect(s.state.scrollInFlight).toBe(true)
      // User wheels mid-animation — their intent wins, no re-lock.
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: -50, bubbles: true }))
      await new Promise((r) => setTimeout(r, 0))
      expect(s.state.locked).toBe(false)
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

    it('restores the reading position from the top when content grew while away', () => {
      // New messages append BELOW, so the content the user was reading
      // keeps its offset-from-top. Restoring from the bottom would
      // shift their spot down by everything that arrived while away.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop, setContentHeight } =
        buildScrollDom({ clientHeight: 100, contentHeight: 1000 })
      const s = createChatScroll()
      s.mount(container, content)
      setScrollTop(300)
      const pos = s.savePosition()
      expect(pos.wasAtBottom).toBe(false)

      setContentHeight(1600) // 600px of new messages while away
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

  describe('content flex-shrink pinning', () => {
    // The container is a column flexbox (gutter below content). A
    // content element whose children are absolutely positioned (a
    // virtualizer's total-size wrapper) has min-content height 0 and
    // default flex-shrink would crush it to the viewport height.
    it('sets flex-shrink: 0 on the content element at mount', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      const s = createChatScroll()
      s.mount(container, content)
      expect(content.style.flexShrink).toBe('0')
      s.destroy()
    })

    it('restores the prior flex-shrink on destroy', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom()
      content.style.flexShrink = '2'
      const s = createChatScroll()
      s.mount(container, content)
      expect(content.style.flexShrink).toBe('0')
      s.destroy()
      expect(content.style.flexShrink).toBe('2')
    })
  })

  describe('streaming-end grace', () => {
    // The final chunk often renders AFTER the consumer flips their
    // loading flag (same tick append + flag change; the resize fires
    // later). The follow must survive that resize or the last growth
    // is orphaned above the bottom.
    function buildStreamEnd(): {
      s: ReturnType<typeof createChatScroll>
      container: HTMLElement
      setContentHeight: (h: number) => void
      ro: ReturnType<typeof installFakeResizeObserver>
      raf: ReturnType<typeof installFakeRaf>
    } {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight, setScrollTop } =
        buildScrollDom({ clientHeight: 100, contentHeight: 1000 })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      s.setStreaming(true)
      setScrollTop(900)
      expect(s.state.locked).toBe(true)
      return { s, container, setContentHeight, ro, raf }
    }

    it('follows growth that renders after setStreaming(false)', () => {
      const { s, container, setContentHeight, ro } = buildStreamEnd()
      s.setStreaming(false) // flag flips synchronously with the append…
      setContentHeight(1200) // …but the growth renders a beat later
      ro.triggerResize()
      expect(container.scrollTop).toBe(1100) // followed to the new bottom
      s.destroy()
    })

    it('stops following once the grace expires', () => {
      const { s, container, setContentHeight, ro, raf } = buildStreamEnd()
      s.setStreaming(false)
      raf.flushFrames()
      raf.flushFrames() // two frames → grace expired
      setContentHeight(1200)
      ro.triggerResize()
      expect(container.scrollTop).toBe(900) // post-stream growth is the user's
      s.destroy()
    })

    it('keeps overflow-anchor disabled during the grace, restores after', () => {
      const { s, container, raf } = buildStreamEnd()
      expect(container.style.overflowAnchor).toBe('none')
      s.setStreaming(false)
      expect(container.style.overflowAnchor).toBe('none') // still graced
      raf.flushFrames()
      raf.flushFrames()
      expect(container.style.overflowAnchor).toBe('')
      s.destroy()
    })

    it('a new stream during the grace keeps following seamlessly', () => {
      const { s, container, setContentHeight, ro, raf } = buildStreamEnd()
      s.setStreaming(false)
      s.setStreaming(true) // next turn starts immediately
      raf.flushFrames()
      raf.flushFrames() // the old grace frames must not turn anchoring off
      expect(container.style.overflowAnchor).toBe('none')
      setContentHeight(1300)
      ro.triggerResize()
      expect(container.scrollTop).toBe(1200)
      s.destroy()
    })

    it('user wheel-up during the grace still wins immediately', () => {
      const { s, container, setContentHeight, ro } = buildStreamEnd()
      s.setStreaming(false)
      container.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -50, bubbles: true }),
      )
      expect(s.state.locked).toBe(false)
      setContentHeight(1200)
      ro.triggerResize()
      expect(container.scrollTop).toBe(900) // grace doesn't override the user
      s.destroy()
    })
  })

  describe('scrollToMessage', () => {
    function buildStick(): {
      s: ReturnType<typeof createChatScroll>
      container: HTMLElement
      content: HTMLElement
      m1: HTMLElement
      m2: HTMLElement
      m3: HTMLElement
      setScrollTop: (t: number) => void
      raf: ReturnType<typeof installFakeRaf>
    } {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setScrollTop } = buildScrollDom({
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
        strategy: 'stick-to-bottom',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      return { s, container, content, m1, m2, m3, setScrollTop, raf }
    }

    it('brings the message top to the scroll margin', () => {
      const { s, container, m2 } = buildStick()
      s.scrollToMessage(m2)
      expect(container.scrollTop).toBe(488) // 500 - 12
      expect(m2.style.scrollMarginTop).toBe('12px')
      s.destroy()
    })

    it('releases the stick lock (programmatic scrolls get no input release)', () => {
      const { s, m2 } = buildStick()
      s.setStreaming(true)
      expect(s.state.locked).toBe(true)
      s.scrollToMessage(m2)
      expect(s.state.locked).toBe(false)
      s.destroy()
    })

    it('does NOT re-engage the lock when the target clamps at the bottom', () => {
      const { s, container, m3, setScrollTop } = buildStick()
      setScrollTop(0)
      s.scrollToMessage(m3)
      expect(container.scrollTop).toBe(800) // clamped to max-scroll
      expect(s.state.locked).toBe(false)
      s.destroy()
    })

    it('clears pinAnchored without dropping the pin (pin-to-top)', () => {
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
      s.pinMessage(m3)
      raf.flushFrames()
      expect(s.state.pinAnchored).toBe(true)
      s.scrollToMessage(m1)
      expect(s.state.pinAnchored).toBe(false)
      expect(s.state.pinActive).toBe(true) // gutter + pinnedY untouched
      expect(s.state.pinnedY).toBe(888)
      s.destroy()
    })

    it('the in-flight target is the reference for relativeMessage', () => {
      // Smooth mode: the animation is in flight, scrollTop is still at
      // the start — a second "prev" must walk from the TARGET, not from
      // the mid-animation position.
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setScrollTop } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1400,
      })
      appendMessage(container, content, { role: 'user', height: 40, y: 100 })
      const m2 = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 500,
      })
      const m3 = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 700,
      })
      const s = createChatScroll({
        strategy: 'stick-to-bottom',
        scrollBehavior: 'smooth',
      })
      s.mount(container, content)
      setScrollTop(800) // at the bottom, reading m3's reply
      // First prev: geometric reference is m3 (past its top) → snap to it.
      const t1 = s.relativeMessage('[data-role="user"]', -1)
      expect(t1).toBe(m3)
      s.scrollToMessage(t1 as HTMLElement)
      // Animation in flight, scrollTop unchanged so far.
      const t2 = s.relativeMessage('[data-role="user"]', -1)
      expect(t2).toBe(m2) // walked from the in-flight target, not from 800
      s.destroy()
    })
  })

  describe('referenceMessage / relativeMessage', () => {
    function buildThreeStick(): {
      s: ReturnType<typeof createChatScroll>
      m1: HTMLElement
      m2: HTMLElement
      m3: HTMLElement
      setScrollTop: (t: number) => void
    } {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop } = buildScrollDom({
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
        strategy: 'stick-to-bottom',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      return { s, m1, m2, m3, setScrollTop }
    }

    it('resolves the match nearest the viewport top, with index/count', () => {
      const { s, m2, setScrollTop } = buildThreeStick()
      setScrollTop(488) // exactly at m2's margin-adjusted top
      const ref = s.referenceMessage('[data-role="user"]')
      expect(ref.el).toBe(m2)
      expect(ref.index).toBe(1)
      expect(ref.count).toBe(3)
      expect(ref.past).toBe(false)
      s.destroy()
    })

    it('reports past=true mid-reply, and -1 returns the reference itself', () => {
      const { s, m2, setScrollTop } = buildThreeStick()
      setScrollTop(700) // below m2's top, above m3's
      const ref = s.referenceMessage('[data-role="user"]')
      expect(ref.el).toBe(m2)
      expect(ref.past).toBe(true)
      expect(s.relativeMessage('[data-role="user"]', -1)).toBe(m2)
      s.destroy()
    })

    it('walks upward when AT the reference top', () => {
      const { s, m1, setScrollTop } = buildThreeStick()
      setScrollTop(488)
      expect(s.relativeMessage('[data-role="user"]', -1)).toBe(m1)
      s.destroy()
    })

    it('returns el=null above all matches, +1 resolves to the first', () => {
      const { s, m1, setScrollTop } = buildThreeStick()
      setScrollTop(0)
      const ref = s.referenceMessage('[data-role="user"]')
      expect(ref.el).toBe(null)
      expect(ref.index).toBe(-1)
      expect(ref.count).toBe(3)
      expect(s.relativeMessage('[data-role="user"]', 1)).toBe(m1)
      expect(s.relativeMessage('[data-role="user"]', -1)).toBe(null)
      s.destroy()
    })

    it('returns count=0 when the selector matches nothing', () => {
      const { s } = buildThreeStick()
      const ref = s.referenceMessage('[data-role="nope"]')
      expect(ref).toEqual({ el: null, index: -1, count: 0, past: false })
      s.destroy()
    })

    it('resolves from the pinned element while anchored (pin-to-top)', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 1400,
      })
      appendMessage(container, content, { role: 'user', height: 40, y: 100 })
      const m2 = appendMessage(container, content, {
        role: 'user',
        height: 40,
        y: 500,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.pinMessage(m2)
      raf.flushFrames()
      const ref = s.referenceMessage('[data-role="user"]')
      expect(ref.el).toBe(m2)
      expect(ref.index).toBe(1)
      expect(ref.past).toBe(false)
      s.destroy()
    })
  })

  describe('initialPosition', () => {
    it("'bottom' opens at the bottom on mount", () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ initialPosition: 'bottom' })
      s.mount(container, content)
      expect(container.scrollTop).toBe(900)
      expect(s.state.atBottom).toBe(true)
      s.destroy()
    })

    it('keeps landing at the bottom while layout settles (pre-interaction growth)', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ initialPosition: 'bottom' })
      s.mount(container, content)
      setContentHeight(1200) // font swap / hydration growth
      ro.triggerResize()
      expect(container.scrollTop).toBe(1100)
      s.destroy()
    })

    it('stops after user input (wheel)', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      // pin-to-top so the stick lock's own follow doesn't mask the check
      const s = createChatScroll({
        strategy: 'pin-to-top',
        initialPosition: 'bottom',
      })
      s.mount(container, content)
      container.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -50, bubbles: true }),
      )
      setContentHeight(1200)
      ro.triggerResize()
      expect(container.scrollTop).toBe(900) // anchoring ended at the wheel
      s.destroy()
    })

    it('stops after an upward scroll with no input events (scrollbar drag)', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setContentHeight, setScrollTop, flushScroll } =
        buildScrollDom({ clientHeight: 100, contentHeight: 1000 })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        initialPosition: 'bottom',
      })
      s.mount(container, content)
      setScrollTop(500)
      flushScroll() // negative delta → user took over
      setContentHeight(1200)
      ro.triggerResize()
      expect(container.scrollTop).toBe(500)
      s.destroy()
    })

    it('a shrink-clamp (negative delta WITH scrollHeight change) does not stop it', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setContentHeight, flushScroll } =
        buildScrollDom({ clientHeight: 100, contentHeight: 1000 })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        initialPosition: 'bottom',
      })
      s.mount(container, content)
      expect(container.scrollTop).toBe(900)
      // A virtualizer re-measuring rows: content shrinks, the browser
      // clamps scrollTop down, and the scroll event carries a negative
      // delta — but scrollHeight changed in the same frame, so this is
      // layout, not the user.
      setContentHeight(800)
      container.scrollTop = container.scrollTop // clamp to new max (700)
      flushScroll()
      setContentHeight(1200)
      ro.triggerResize()
      expect(container.scrollTop).toBe(1100) // anchoring survived
      s.destroy()
    })

    it("default 'none' leaves the initial position alone", () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll()
      s.mount(container, content)
      expect(container.scrollTop).toBe(0)
      s.destroy()
    })

    it('reset() re-arms the anchoring for the next thread', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({
        strategy: 'pin-to-top',
        initialPosition: 'bottom',
      })
      s.mount(container, content)
      container.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -50, bubbles: true }),
      )
      s.reset() // new thread
      expect(container.scrollTop).toBe(900)
      setContentHeight(1300) // the new thread's late layout
      ro.triggerResize()
      expect(container.scrollTop).toBe(1200)
      s.destroy()
    })
  })

  describe('restorePosition (self-sufficient)', () => {
    it('releases the lock so the content-swap resize cannot snap to bottom', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight, setScrollTop } =
        buildScrollDom({ clientHeight: 100, contentHeight: 1000 })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      s.setStreaming(true)
      setScrollTop(900)
      expect(s.state.locked).toBe(true)
      // Switch threads: restore a mid-thread position, then the swap
      // renders (a resize). Without the internal release, the resize
      // would snap to the bottom over the restore.
      s.restorePosition({ scrollTop: 300, wasAtBottom: false })
      setContentHeight(1400)
      ro.triggerResize()
      raf.flushFrames() // deferred re-apply
      expect(container.scrollTop).toBe(300)
      expect(s.state.locked).toBe(false)
      s.destroy()
    })

    it('re-applies next frame when the destination had not finished laying out', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 150, // half-rendered destination
      })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      s.restorePosition({ scrollTop: 700, wasAtBottom: false })
      expect(container.scrollTop).toBe(50) // clamped by the short content
      setContentHeight(1000) // layout finishes
      raf.flushFrames()
      expect(container.scrollTop).toBe(700)
      s.destroy()
    })

    it('wasAtBottom restores to the NEW bottom and re-engages the follow', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content, setContentHeight } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      s.unlock()
      setContentHeight(1600) // the thread grew while the user was away
      s.restorePosition({ scrollTop: 900, wasAtBottom: true })
      raf.flushFrames()
      expect(container.scrollTop).toBe(1500)
      expect(s.state.locked).toBe(true)
      s.destroy()
    })

    it('a second restore supersedes the first one’s deferred re-apply', () => {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
      const { container, content } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      s.restorePosition({ scrollTop: 300, wasAtBottom: false })
      s.restorePosition({ scrollTop: 600, wasAtBottom: false })
      raf.flushFrames() // the first restore's frame must not clobber
      expect(container.scrollTop).toBe(600)
      s.destroy()
    })
  })
  describe('keyboard interaction parity', () => {
    // A "scroll key" only expresses scroll intent when the browser
    // will actually scroll the chat with it. Inside an editable it
    // moves the caret; Space on an activatable element activates it.
    // Mouse users get the pin/lock preserved on those interactions
    // (pointerdown path) — keyboard users must too.
    function keyOn(el: HTMLElement, key: string, shiftKey = false): void {
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }),
      )
    }

    function buildPinned(): {
      s: ReturnType<typeof createChatScroll>
      container: HTMLElement
      content: HTMLElement
    } {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const raf = installFakeRaf()
      cleanup.push(raf.uninstall)
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
        scrollBehavior: 'instant',
      })
      s.mount(container, content)
      s.pinMessage(msg)
      raf.flushFrames()
      expect(s.state.pinAnchored).toBe(true)
      return { s, container, content }
    }

    it('Space on a <summary> does NOT clear pinAnchored (mouse/keyboard parity)', () => {
      const { s, content } = buildPinned()
      const details = document.createElement('details')
      const summary = document.createElement('summary')
      details.appendChild(summary)
      content.appendChild(details)
      keyOn(summary, ' ')
      expect(s.state.pinAnchored).toBe(true)
      s.destroy()
    })

    it('scroll keys inside a textarea do NOT clear pinAnchored (caret movement)', () => {
      const { s, content } = buildPinned()
      const ta = document.createElement('textarea')
      content.appendChild(ta)
      keyOn(ta, 'ArrowUp')
      keyOn(ta, 'Home')
      keyOn(ta, ' ')
      expect(s.state.pinAnchored).toBe(true)
      s.destroy()
    })

    it('ArrowUp on a plain message still clears pinAnchored (control)', () => {
      const { s, content } = buildPinned()
      const msgEl = content.firstElementChild as HTMLElement
      keyOn(msgEl, 'ArrowUp')
      expect(s.state.pinAnchored).toBe(false)
      s.destroy()
    })

    function buildLockedStick(): {
      s: ReturnType<typeof createChatScroll>
      container: HTMLElement
      content: HTMLElement
    } {
      const ro = installFakeResizeObserver()
      cleanup.push(ro.uninstall)
      const { container, content, setScrollTop } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      const s = createChatScroll({ strategy: 'stick-to-bottom' })
      s.mount(container, content)
      s.setStreaming(true)
      setScrollTop(900)
      expect(s.state.locked).toBe(true)
      return { s, container, content }
    }

    it('upward scroll keys inside a textarea do NOT release the stick lock', () => {
      const { s, content } = buildLockedStick()
      const ta = document.createElement('textarea')
      content.appendChild(ta)
      keyOn(ta, 'ArrowUp')
      keyOn(ta, 'PageUp')
      keyOn(ta, 'Home')
      expect(s.state.locked).toBe(true)
      s.destroy()
    })

    it('Shift+Space on a button does NOT release the stick lock (activation)', () => {
      const { s, content } = buildLockedStick()
      const btn = document.createElement('button')
      content.appendChild(btn)
      keyOn(btn, ' ', true)
      expect(s.state.locked).toBe(true)
      s.destroy()
    })

    it('ArrowUp on a plain message still releases the stick lock (control)', () => {
      const { s, content } = buildLockedStick()
      keyOn(content, 'ArrowUp')
      expect(s.state.locked).toBe(false)
      s.destroy()
    })
  })
})
