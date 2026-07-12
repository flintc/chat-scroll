import { createRoot, createSignal } from 'solid-js'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createChatScroll } from '../src/create-chat-scroll'

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
  if (!('ResizeObserver' in window)) {
    class FakeRO implements ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    ;(
      window as unknown as { ResizeObserver: typeof ResizeObserver }
    ).ResizeObserver = FakeRO as unknown as typeof ResizeObserver
  }
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('createChatScroll (Solid)', () => {
  it('mounts after both refs are set', () => {
    createRoot((dispose) => {
      const scroll = createChatScroll({ strategy: 'pin-to-top' })
      const container = document.createElement('div')
      const content = document.createElement('div')
      container.appendChild(content)
      document.body.appendChild(container)

      scroll.containerRef(container)
      // before content ref → no gutter yet
      expect(container.querySelector('[data-chat-scroll-gutter]')).toBeNull()

      scroll.contentRef(content)
      expect(container.querySelector('[data-chat-scroll-gutter]')).toBeTruthy()
      expect(container.style.display).toBe('flex')
      dispose()
    })
  })

  it('exposes a reactive state signal', () => {
    createRoot((dispose) => {
      const scroll = createChatScroll()
      const container = document.createElement('div')
      const content = document.createElement('div')
      container.appendChild(content)
      document.body.appendChild(container)
      scroll.containerRef(container)
      scroll.contentRef(content)

      expect(scroll.state().streaming).toBe(false)
      scroll.setStreaming(true)
      expect(scroll.state().streaming).toBe(true)
      dispose()
    })
  })

  it('destroys the instance on root disposal', () => {
    let destroySpy!: ReturnType<typeof vi.spyOn>
    createRoot((dispose) => {
      const scroll = createChatScroll()
      destroySpy = vi.spyOn(scroll.instance, 'destroy')
      const container = document.createElement('div')
      const content = document.createElement('div')
      container.appendChild(content)
      document.body.appendChild(container)
      scroll.containerRef(container)
      scroll.contentRef(content)
      dispose()
    })
    expect(destroySpy).toHaveBeenCalled()
  })

  it('mirrors a reactive `streaming` accessor into the controller', () => {
    // Signal writes inside createRoot's init body are batched until it
    // returns; do the writes outside so the effect flushes synchronously.
    let scroll!: ReturnType<typeof createChatScroll>
    let setLoading!: (v: boolean) => boolean
    let dispose!: () => void
    createRoot((d) => {
      const [loading, set] = createSignal(false)
      setLoading = set
      scroll = createChatScroll({ streaming: loading })
      dispose = d
    })

    expect(scroll.state().streaming).toBe(false)
    setLoading(true)
    expect(scroll.state().streaming).toBe(true)
    setLoading(false)
    expect(scroll.state().streaming).toBe(false)
    dispose()
  })

  it('applies the initial `streaming` value on creation', () => {
    createRoot((dispose) => {
      const scroll = createChatScroll({ streaming: () => true })
      expect(scroll.state().streaming).toBe(true)
      dispose()
    })
  })

  it('leaves the imperative path untouched when `streaming` is omitted', () => {
    createRoot((dispose) => {
      const scroll = createChatScroll()
      expect(scroll.state().streaming).toBe(false)
      scroll.setStreaming(true)
      expect(scroll.state().streaming).toBe(true)
      dispose()
    })
  })

  it('forwards ChatScrollInstance methods', () => {
    createRoot((dispose) => {
      const scroll = createChatScroll({ strategy: 'stick-to-bottom' })
      const container = document.createElement('div')
      const content = document.createElement('div')
      container.appendChild(content)
      document.body.appendChild(container)
      scroll.containerRef(container)
      scroll.contentRef(content)

      // lock/unlock should mirror state
      scroll.unlock()
      expect(scroll.state().locked).toBe(false)
      scroll.lock()
      expect(scroll.state().locked).toBe(true)
      dispose()
    })
  })

  it('re-exposes pin-to-top navigation methods', () => {
    createRoot((dispose) => {
      const scroll = createChatScroll({ strategy: 'pin-to-top' })
      expect(typeof scroll.pinMessage).toBe('function')
      expect(typeof scroll.pinLatest).toBe('function')
      expect(typeof scroll.pinRelative).toBe('function')
      dispose()
    })
  })

  it('runs without an owner without throwing', () => {
    // Using outside of createRoot: callers must clean up themselves.
    const scroll = createChatScroll()
    expect(scroll.state().atBottom).toBe(true)
    scroll.instance.destroy()
  })
})
