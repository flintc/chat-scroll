import { afterEach, describe, expect, it } from 'vitest'

import {
  calcGutterHeight,
  createGutter,
  destroyGutter,
  setGutterHeight,
} from '../src/gutter'

import { buildScrollDom } from './_test-utils'

describe('gutter', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('createGutter appends a styled element to the container', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    const g = createGutter(c)
    expect(c.contains(g)).toBe(true)
    expect(g.style.flexShrink).toBe('0')
    expect(g.style.pointerEvents).toBe('none')
    expect(g.style.height).toBe('0px')
    expect(g.getAttribute('data-chat-scroll-gutter')).toBe('')
  })

  it('createGutter is idempotent — reuses an existing gutter', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    const g1 = createGutter(c)
    const g2 = createGutter(c)
    expect(g1).toBe(g2)
  })

  it("createGutter does not adopt a NESTED instance's gutter", () => {
    // A chat preview embedded inside a message has its own container +
    // gutter. The outer container must create its own gutter rather
    // than hijacking the descendant one (only direct children count
    // for the idempotency check).
    const outer = document.createElement('div')
    const message = document.createElement('div')
    const innerChat = document.createElement('div')
    outer.appendChild(message)
    message.appendChild(innerChat)
    document.body.appendChild(outer)

    const innerGutter = createGutter(innerChat)
    const outerGutter = createGutter(outer)
    expect(outerGutter).not.toBe(innerGutter)
    expect(outerGutter.parentElement).toBe(outer)
    expect(innerGutter.parentElement).toBe(innerChat)
  })

  it('setGutterHeight clamps negatives to 0', () => {
    const g = document.createElement('div')
    setGutterHeight(g, -50)
    expect(g.style.height).toBe('0px')
  })

  it('setGutterHeight rounds fractional values', () => {
    const g = document.createElement('div')
    setGutterHeight(g, 12.7)
    expect(g.style.height).toBe('13px')
  })

  it('destroyGutter removes the element from the DOM', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    const g = createGutter(c)
    destroyGutter(g)
    expect(c.contains(g)).toBe(false)
  })

  describe('calcGutterHeight', () => {
    it('returns 0 when no pin (-1)', () => {
      const { container, mountGutter } = buildScrollDom()
      const gutter = mountGutter()
      expect(calcGutterHeight({ container, gutter, pinnedY: -1 })).toBe(0)
    })

    it('fills viewport when content is short', () => {
      // viewport=600, pinnedY=0, contentH=200, no padding
      // gutter.offsetTop=200, paddingBottom=0
      // gutter = max(0, 0 + 600 - 200 - 0) = 400
      const { container, setContainerHeight, setContentHeight, mountGutter } =
        buildScrollDom()
      const gutter = mountGutter()
      setContainerHeight(600)
      setContentHeight(200)
      expect(calcGutterHeight({ container, gutter, pinnedY: 0 })).toBe(400)
    })

    it('shrinks as content grows past viewport', () => {
      // viewport=600, pinnedY=100, contentH=800
      // gutter.offsetTop=800, so gutter = max(0, 100+600-800-0) = -100 → 0
      const { container, setContainerHeight, setContentHeight, mountGutter } =
        buildScrollDom()
      const gutter = mountGutter()
      setContainerHeight(600)
      setContentHeight(800)
      expect(calcGutterHeight({ container, gutter, pinnedY: 100 })).toBe(0)
    })

    it('respects pinnedY when measuring from a non-zero anchor', () => {
      // viewport=600, pinnedY=300, contentH=700 → gutter = 600+300-700 = 200
      const { container, setContainerHeight, setContentHeight, mountGutter } =
        buildScrollDom()
      const gutter = mountGutter()
      setContainerHeight(600)
      setContentHeight(700)
      expect(calcGutterHeight({ container, gutter, pinnedY: 300 })).toBe(200)
    })

    it('never returns a negative number', () => {
      const { container, setContainerHeight, setContentHeight, mountGutter } =
        buildScrollDom()
      const gutter = mountGutter()
      setContainerHeight(100)
      setContentHeight(10000)
      expect(
        calcGutterHeight({ container, gutter, pinnedY: 0 }),
      ).toBeGreaterThanOrEqual(0)
    })
  })

  /**
   * The **tight-pin contract**: after `calcGutterHeight` is applied,
   * `container.scrollHeight - container.clientHeight === pinnedY` exactly,
   * regardless of consumer CSS (container padding, content padding/border,
   * sibling margins). These tests vary the layout knobs a consumer can
   * touch and prove the contract holds.
   */
  describe('tight-pin invariant', () => {
    type Layout = {
      label: string
      containerH: number
      contentH: number
      containerPaddingTop?: number
      containerPaddingBottom?: number
      /** Treat as content's padding-bottom or border — anything inside
       *  content.offsetHeight is automatically included. We just bump
       *  contentH to model it; what matters for the formula is the
       *  observable height of content as a flex/block child. */
      contentMarginBottom?: number
      pinnedY: number
    }
    const cases: Layout[] = [
      {
        label: 'bare container, short content',
        containerH: 600,
        contentH: 200,
        pinnedY: 50,
      },
      {
        label: 'container with symmetric padding (16/16)',
        containerH: 600,
        contentH: 200,
        containerPaddingTop: 16,
        containerPaddingBottom: 16,
        pinnedY: 50,
      },
      {
        label: 'container with asymmetric padding (20/4)',
        containerH: 600,
        contentH: 200,
        containerPaddingTop: 20,
        containerPaddingBottom: 4,
        pinnedY: 50,
      },
      {
        label: 'content effectively has padding-bottom (folded into contentH)',
        containerH: 600,
        contentH: 312, // 300 of bubbles + 12 of padding-bottom
        pinnedY: 50,
      },
      {
        label: 'both: container padding + content padding folded into contentH',
        containerH: 600,
        contentH: 312,
        containerPaddingTop: 16,
        containerPaddingBottom: 16,
        pinnedY: 100,
      },
      {
        label: 'content has bottom margin (sibling gap before gutter)',
        containerH: 600,
        contentH: 200,
        contentMarginBottom: 24,
        pinnedY: 50,
      },
      {
        label: 'kitchen sink: container padding + content padding + margin',
        containerH: 600,
        contentH: 312,
        containerPaddingTop: 16,
        containerPaddingBottom: 16,
        contentMarginBottom: 24,
        pinnedY: 80,
      },
      {
        label: 'pinnedY=0 (first message pinned, no offset)',
        containerH: 600,
        contentH: 100,
        containerPaddingTop: 16,
        containerPaddingBottom: 16,
        pinnedY: 0,
      },
      {
        label: 'very tall pinnedY (deep in the conversation)',
        containerH: 600,
        contentH: 200,
        containerPaddingTop: 16,
        containerPaddingBottom: 16,
        pinnedY: 5000,
      },
    ]

    for (const c of cases) {
      it(`maxScroll === pinnedY — ${c.label}`, () => {
        const {
          container,
          setContainerHeight,
          setContentHeight,
          setContainerPadding,
          setContentMarginBottom,
          maxScroll,
          mountGutter,
        } = buildScrollDom()
        const gutter = mountGutter()
        setContainerHeight(c.containerH)
        setContentHeight(c.contentH)
        setContainerPadding(
          c.containerPaddingTop ?? 0,
          c.containerPaddingBottom ?? 0,
        )
        setContentMarginBottom(c.contentMarginBottom ?? 0)

        const h = calcGutterHeight({ container, gutter, pinnedY: c.pinnedY })
        setGutterHeight(gutter, h)

        expect(maxScroll()).toBe(c.pinnedY)
      })
    }

    it("content already taller than viewport+pinnedY → gutter is 0, max-scroll is content's natural max", () => {
      const {
        container,
        setContainerHeight,
        setContentHeight,
        setContainerPadding,
        maxScroll,
        mountGutter,
      } = buildScrollDom()
      const gutter = mountGutter()
      setContainerHeight(600)
      setContentHeight(2000)
      setContainerPadding(16, 16)
      const h = calcGutterHeight({ container, gutter, pinnedY: 100 })
      setGutterHeight(gutter, h)
      expect(h).toBe(0)
      // Without gutter, max-scroll is content+paddings-clientHeight =
      // 16+2000+16-600 = 1432. The pin can't be tighter than the natural
      // content overflow — that's by design.
      expect(maxScroll()).toBe(1432)
    })

    it('recomputing with a different pinnedY converges to the new tight bound', () => {
      // Simulates the resize-recalc cycle: gutter is already set for one
      // pinnedY, then pinnedY changes (e.g., content above the pin
      // expanded). The new computation must land tight against the new pin.
      const {
        container,
        setContainerHeight,
        setContentHeight,
        setContainerPadding,
        maxScroll,
        mountGutter,
      } = buildScrollDom()
      const gutter = mountGutter()
      setContainerHeight(600)
      setContentHeight(300)
      setContainerPadding(16, 16)

      setGutterHeight(gutter, calcGutterHeight({ container, gutter, pinnedY: 50 }))
      expect(maxScroll()).toBe(50)

      setGutterHeight(gutter, calcGutterHeight({ container, gutter, pinnedY: 200 }))
      expect(maxScroll()).toBe(200)

      setGutterHeight(gutter, calcGutterHeight({ container, gutter, pinnedY: 25 }))
      expect(maxScroll()).toBe(25)
    })
  })
})
