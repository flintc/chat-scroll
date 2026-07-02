import { act, render, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
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

  it('live-syncs pinClamp, and clears it when the prop is removed', () => {
    let opts: Parameters<typeof useChatScroll>[0] = {
      strategy: 'pin-to-top',
    }
    const { result, rerender } = renderHook(
      (o: typeof opts) => useChatScroll(o),
      { initialProps: opts },
    )
    expect(result.current.instance.options.pinClamp).toBeUndefined()
    opts = {
      strategy: 'pin-to-top',
      pinClamp: { tallerThan: 160, visibleHeight: 96 },
    }
    rerender(opts)
    expect(result.current.instance.options.pinClamp).toEqual({
      tallerThan: 160,
      visibleHeight: 96,
    })
    // Dropping the prop turns the clamp off (pinClamp is clearable —
    // explicit `undefined` clears rather than being ignored).
    opts = { strategy: 'pin-to-top' }
    rerender(opts)
    expect(result.current.instance.options.pinClamp).toBeUndefined()
  })

  it('clears a pinClamp passed in the initial options when the prop is dropped', () => {
    let opts: Parameters<typeof useChatScroll>[0] = {
      strategy: 'pin-to-top',
      pinClamp: { tallerThan: 160, visibleHeight: 96 },
    }
    const { result, rerender } = renderHook(
      (o: typeof opts) => useChatScroll(o),
      { initialProps: opts },
    )
    expect(result.current.instance.options.pinClamp).toEqual({
      tallerThan: 160,
      visibleHeight: 96,
    })
    opts = { strategy: 'pin-to-top' }
    rerender(opts)
    expect(result.current.instance.options.pinClamp).toBeUndefined()
  })

  it('never sends pinClamp when the consumer never passed it — imperative clamps survive', () => {
    let opts: Parameters<typeof useChatScroll>[0] = {
      strategy: 'pin-to-top',
      bottomThreshold: 40,
    }
    const { result, rerender } = renderHook(
      (o: typeof opts) => useChatScroll(o),
      { initialProps: opts },
    )
    // The composer-overlay recipe pattern: enable the clamp imperatively.
    act(() =>
      result.current.instance.setOptions({
        pinClamp: { tallerThan: 160, visibleHeight: 96 },
      }),
    )
    // An unrelated reactive option change re-runs the sync effect. The
    // consumer never drove `pinClamp` declaratively, so the key must not
    // be sent (an explicit `undefined` would clear the clamp).
    opts = { strategy: 'pin-to-top', bottomThreshold: 200 }
    rerender(opts)
    expect(result.current.instance.options.bottomThreshold).toBe(200)
    expect(result.current.instance.options.pinClamp).toEqual({
      tallerThan: 160,
      visibleHeight: 96,
    })
  })

  it('re-exposes pin-to-top navigation methods', () => {
    const { result } = renderHook(() => useChatScroll({ strategy: 'pin-to-top' }))
    expect(typeof result.current.pinMessage).toBe('function')
    expect(typeof result.current.pinLatest).toBe('function')
    expect(typeof result.current.pinRelative).toBe('function')
  })

  it('does not clobber defaulted options via the option-sync effect', () => {
    // The sync effect passes every option key on every render, with
    // `undefined` for the ones the consumer never set. The core must
    // keep its resolved defaults (a regression here breaks at-bottom
    // detection and makes pinnedY NaN).
    const { result } = renderHook(() =>
      useChatScroll({ strategy: 'pin-to-top' }),
    )
    expect(result.current.instance.options.bottomThreshold).toBe(40)
    expect(result.current.instance.options.scrollMargin).toBe(12)
    expect(result.current.instance.options.scrollBehavior).toBe('auto')
    expect(result.current.instance.options.scrollDurationMs).toBe(320)
  })

  it('survives React StrictMode (simulated unmount/remount keeps the instance live)', () => {
    // StrictMode runs effect setup → cleanup → setup. The cleanup calls
    // instance.destroy(); under React 18 callback refs are NOT
    // re-invoked on the simulated remount, so the mount effect's setup
    // half must re-mount from the stored refs. Without it the gutter,
    // listeners, and observer stay dead for the component's real life.
    function Chat() {
      const scroll = useChatScroll()
      return (
        <div data-testid="container" ref={scroll.containerRef}>
          <div ref={scroll.contentRef} />
        </div>
      )
    }
    const { getByTestId } = render(
      <StrictMode>
        <Chat />
      </StrictMode>,
    )
    const container = getByTestId('container') as HTMLElement
    // Styles + gutter present ⇒ the instance is mounted after the
    // StrictMode double-invoke cycle.
    expect(container.style.display).toBe('flex')
    expect(container.querySelector('[data-chat-scroll-gutter]')).toBeTruthy()
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
