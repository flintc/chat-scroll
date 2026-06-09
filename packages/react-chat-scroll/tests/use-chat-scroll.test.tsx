import { act, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatScroll } from '../src/use-chat-scroll'

// Stub matchMedia + ResizeObserver for jsdom.
beforeEachInstallMatchMedia()
beforeEachInstallResizeObserver()

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useChatScroll (React)', () => {
  it('returns a stable instance and reactive state', () => {
    const { result } = renderHook(() => useChatScroll({ strategy: 'pin-to-top' }))
    expect(result.current.instance).toBeDefined()
    expect(result.current.state.atBottom).toBe(true)
    expect(result.current.state.streaming).toBe(false)
  })

  it('does not mount until both refs are set', () => {
    const { result } = renderHook(() => useChatScroll())
    const container = document.createElement('div')
    document.body.appendChild(container)

    // container alone — no gutter yet
    act(() => result.current.containerRef(container))
    expect(container.querySelector('[data-chat-scroll-gutter]')).toBeNull()

    const content = document.createElement('div')
    container.appendChild(content)

    // content arrives — instance mounts now
    act(() => result.current.contentRef(content))
    expect(container.querySelector('[data-chat-scroll-gutter]')).toBeTruthy()
  })

  it('renders inside a component and exposes setStreaming', () => {
    function Chat() {
      const scroll = useChatScroll()
      return (
        <div data-testid="container" ref={scroll.containerRef}>
          <div data-testid="content" ref={scroll.contentRef}>
            <button onClick={() => scroll.setStreaming(true)}>stream</button>
          </div>
        </div>
      )
    }
    const { getByTestId, getByText } = render(<Chat />)
    const container = getByTestId('container') as HTMLElement
    expect(container.style.display).toBe('flex')
    act(() => {
      getByText('stream').click()
    })
    expect(container.style.overflowAnchor).toBe('none')
  })

  it('updates state via subscribe → useSyncExternalStore', () => {
    function Chat() {
      const scroll = useChatScroll()
      return (
        <div data-testid="container" ref={scroll.containerRef}>
          <div ref={scroll.contentRef} />
          <span data-testid="atbottom">{String(scroll.state.atBottom)}</span>
          <button onClick={() => scroll.setStreaming(true)}>stream</button>
          <span data-testid="streaming">{String(scroll.state.streaming)}</span>
        </div>
      )
    }
    const { getByTestId, getByText } = render(<Chat />)
    expect(getByTestId('streaming').textContent).toBe('false')
    act(() => {
      getByText('stream').click()
    })
    expect(getByTestId('streaming').textContent).toBe('true')
  })

  it('mirrors a reactive `streaming` prop into the controller', () => {
    const { result, rerender } = renderHook(
      (loading: boolean) => useChatScroll({ streaming: loading }),
      { initialProps: false },
    )
    expect(result.current.state.streaming).toBe(false)

    rerender(true)
    expect(result.current.state.streaming).toBe(true)

    rerender(false)
    expect(result.current.state.streaming).toBe(false)
  })

  it('applies the initial `streaming` value on mount', () => {
    const { result } = renderHook(() => useChatScroll({ streaming: true }))
    expect(result.current.state.streaming).toBe(true)
  })

  it('leaves the imperative path untouched when `streaming` is omitted', () => {
    const { result } = renderHook(() => useChatScroll())
    expect(result.current.state.streaming).toBe(false)
    act(() => result.current.setStreaming(true))
    expect(result.current.state.streaming).toBe(true)
  })

  it('forwards options changes via setOptions', () => {
    let opts = { bottomThreshold: 40 }
    const { result, rerender } = renderHook(
      (o: typeof opts) => useChatScroll(o),
      { initialProps: opts },
    )
    expect(result.current.instance.options.bottomThreshold).toBe(40)
    opts = { bottomThreshold: 200 }
    rerender(opts)
    expect(result.current.instance.options.bottomThreshold).toBe(200)
  })

  it('re-exposes pin-to-top navigation methods', () => {
    const { result } = renderHook(() => useChatScroll({ strategy: 'pin-to-top' }))
    expect(typeof result.current.pinMessage).toBe('function')
    expect(typeof result.current.pinLatest).toBe('function')
    expect(typeof result.current.pinRelative).toBe('function')
  })

  it('destroys the instance on unmount', () => {
    let scrollRef: ReturnType<typeof useChatScroll> | null = null
    function Chat() {
      const scroll = useChatScroll()
      scrollRef = scroll
      return (
        <div ref={scroll.containerRef}>
          <div ref={scroll.contentRef} />
        </div>
      )
    }
    const { unmount } = render(<Chat />)
    const destroySpy = vi.spyOn(scrollRef!.instance, 'destroy')
    unmount()
    expect(destroySpy).toHaveBeenCalled()
  })
})

// ── helpers ───────────────────────────────────────────────────────
function beforeEachInstallMatchMedia(): void {
  if (typeof window === 'undefined') return
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
}

function beforeEachInstallResizeObserver(): void {
  if (typeof window === 'undefined') return
  if (!('ResizeObserver' in window)) {
    class FakeRO implements ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    ;(window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      FakeRO as unknown as typeof ResizeObserver
  }
}
