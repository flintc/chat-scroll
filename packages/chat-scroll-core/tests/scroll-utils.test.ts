import { describe, expect, it, afterEach } from 'vitest'

import {
  isAtBottom,
  offsetWithin,
  resolveScrollBehavior,
} from '../src/scroll-utils'

import { buildScrollDom, installMatchMedia } from './_test-utils'

describe('scroll-utils', () => {
  let cleanup: Array<() => void> = []
  afterEach(() => {
    cleanup.forEach((c) => c())
    cleanup = []
    document.body.innerHTML = ''
  })

  describe('resolveScrollBehavior', () => {
    it('returns smooth for smooth', () => {
      expect(resolveScrollBehavior('smooth')).toBe('smooth')
    })

    it('returns instant for instant', () => {
      expect(resolveScrollBehavior('instant')).toBe('instant')
    })

    it('auto resolves to smooth when reduced-motion is off', () => {
      const mm = installMatchMedia(false)
      cleanup.push(mm.uninstall)
      expect(resolveScrollBehavior('auto')).toBe('smooth')
    })

    it('auto resolves to instant when reduced-motion is on', () => {
      const mm = installMatchMedia(true)
      cleanup.push(mm.uninstall)
      expect(resolveScrollBehavior('auto')).toBe('instant')
    })

    it('rereads matchMedia each call so user can flip mid-session', () => {
      const mm = installMatchMedia(false)
      cleanup.push(mm.uninstall)
      expect(resolveScrollBehavior('auto')).toBe('smooth')
      mm.setReducedMotion(true)
      expect(resolveScrollBehavior('auto')).toBe('instant')
    })
  })

  describe('isAtBottom', () => {
    it('true when within threshold', () => {
      const { container, setScrollTop } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      setScrollTop(870) // 1000 - 100 - 870 = 30 → within 40
      expect(isAtBottom(container, 40)).toBe(true)
    })

    it('false when above threshold', () => {
      const { container, setScrollTop } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      setScrollTop(800) // 100 remaining → outside 40
      expect(isAtBottom(container, 40)).toBe(false)
    })

    it('true when content fits in viewport', () => {
      const { container } = buildScrollDom({
        clientHeight: 1000,
        contentHeight: 100,
      })
      expect(isAtBottom(container, 40)).toBe(true)
    })

    it('threshold is inclusive at the boundary', () => {
      const { container, setScrollTop } = buildScrollDom({
        clientHeight: 100,
        contentHeight: 1000,
      })
      setScrollTop(860) // exactly 40 px from bottom
      expect(isAtBottom(container, 40)).toBe(true)
    })
  })

  describe('offsetWithin', () => {
    it('measures element offset relative to container', () => {
      const { container, content } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 2000,
      })
      const msg = document.createElement('div')
      content.appendChild(msg)
      msg.getBoundingClientRect = () =>
        ({
          top: 250,
          left: 0,
          bottom: 290,
          right: 800,
          width: 800,
          height: 40,
          x: 0,
          y: 250,
          toJSON: () => ({}),
        }) as DOMRect
      expect(offsetWithin(msg, container)).toBe(250)
    })

    it('adds container.scrollTop so result is the equivalent scrollTop', () => {
      const { container, content, setScrollTop } = buildScrollDom({
        clientHeight: 600,
        contentHeight: 2000,
      })
      setScrollTop(100)
      const msg = document.createElement('div')
      content.appendChild(msg)
      msg.getBoundingClientRect = () =>
        ({
          top: 50, // visually 50px below container.top
          left: 0,
          bottom: 90,
          right: 800,
          width: 800,
          height: 40,
          x: 0,
          y: 50,
          toJSON: () => ({}),
        }) as DOMRect
      // 50 (rect.top) - 0 (container.top) + 100 (scrollTop) = 150
      expect(offsetWithin(msg, container)).toBe(150)
    })
  })
})
