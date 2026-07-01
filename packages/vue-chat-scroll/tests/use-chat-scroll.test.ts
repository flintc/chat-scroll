import { mount } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { useChatScroll } from '../src/use-chat-scroll'
import type { UseChatScrollOptions } from '../src/use-chat-scroll'

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
    ;(window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      FakeRO as unknown as typeof ResizeObserver
  }
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useChatScroll (Vue)', () => {
  it('mounts after both refs are bound', async () => {
    const Comp = defineComponent({
      setup() {
        const scroll = useChatScroll()
        return { scroll }
      },
      render() {
        return h('div', {
          ref: this.scroll.containerRef,
          'data-test': 'container',
        }, [
          h('div', { ref: this.scroll.contentRef, 'data-test': 'content' }),
        ])
      },
    })

    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    const container = wrapper.get('[data-test="container"]').element as HTMLElement
    expect(container.querySelector('[data-chat-scroll-gutter]')).toBeTruthy()
    expect(container.style.display).toBe('flex')
    wrapper.unmount()
  })

  it('exposes reactive state', async () => {
    let scrollRef!: ReturnType<typeof useChatScroll>
    const Comp = defineComponent({
      setup() {
        const scroll = useChatScroll()
        scrollRef = scroll
        return () =>
          h('div', { ref: scroll.containerRef }, [
            h('div', { ref: scroll.contentRef }),
          ])
      },
    })

    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.streaming).toBe(false)
    scrollRef.setStreaming(true)
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.streaming).toBe(true)
    wrapper.unmount()
  })

  it('reacts to ref-based options changes', async () => {
    let scrollRef!: ReturnType<typeof useChatScroll>
    let optsRef!: ReturnType<typeof ref<{ bottomThreshold: number }>>
    const Comp = defineComponent({
      setup() {
        const opts = ref({ bottomThreshold: 40 })
        optsRef = opts
        const scroll = useChatScroll(opts)
        scrollRef = scroll
        return () => h('div', { ref: scroll.containerRef })
      },
    })

    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(scrollRef.instance.options.bottomThreshold).toBe(40)
    optsRef.value = { bottomThreshold: 200 }
    await wrapper.vm.$nextTick()
    expect(scrollRef.instance.options.bottomThreshold).toBe(200)
    wrapper.unmount()
  })

  it('live-syncs pinClamp through ref-based options, and clears on removal', async () => {
    let scrollRef!: ReturnType<typeof useChatScroll>
    let optsRef!: ReturnType<typeof ref<UseChatScrollOptions>>
    const Comp = defineComponent({
      setup() {
        const opts = ref<UseChatScrollOptions>({ strategy: 'pin-to-top' })
        optsRef = opts
        const scroll = useChatScroll(opts)
        scrollRef = scroll
        return () => h('div', { ref: scroll.containerRef })
      },
    })

    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(scrollRef.instance.options.pinClamp).toBeUndefined()
    optsRef.value = {
      strategy: 'pin-to-top',
      pinClamp: { tallerThan: 160, visibleHeight: 96 },
    }
    await wrapper.vm.$nextTick()
    expect(scrollRef.instance.options.pinClamp).toEqual({
      tallerThan: 160,
      visibleHeight: 96,
    })
    // Dropping the key turns the clamp off (pinClamp is clearable —
    // explicit `undefined` clears rather than being ignored).
    optsRef.value = { strategy: 'pin-to-top' }
    await wrapper.vm.$nextTick()
    expect(scrollRef.instance.options.pinClamp).toBeUndefined()
    wrapper.unmount()
  })

  it('clears a pinClamp present in the initial options when the key is dropped', async () => {
    let scrollRef!: ReturnType<typeof useChatScroll>
    let optsRef!: ReturnType<typeof ref<UseChatScrollOptions>>
    const Comp = defineComponent({
      setup() {
        const opts = ref<UseChatScrollOptions>({
          strategy: 'pin-to-top',
          pinClamp: { tallerThan: 160, visibleHeight: 96 },
        })
        optsRef = opts
        const scroll = useChatScroll(opts)
        scrollRef = scroll
        return () => h('div', { ref: scroll.containerRef })
      },
    })

    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(scrollRef.instance.options.pinClamp).toEqual({
      tallerThan: 160,
      visibleHeight: 96,
    })
    optsRef.value = { strategy: 'pin-to-top' }
    await wrapper.vm.$nextTick()
    expect(scrollRef.instance.options.pinClamp).toBeUndefined()
    wrapper.unmount()
  })

  it('never sends pinClamp when the consumer never passed it — imperative clamps survive', async () => {
    let scrollRef!: ReturnType<typeof useChatScroll>
    let optsRef!: ReturnType<typeof ref<UseChatScrollOptions>>
    const Comp = defineComponent({
      setup() {
        const opts = ref<UseChatScrollOptions>({
          strategy: 'pin-to-top',
          bottomThreshold: 40,
        })
        optsRef = opts
        const scroll = useChatScroll(opts)
        scrollRef = scroll
        return () => h('div', { ref: scroll.containerRef })
      },
    })

    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    // The composer-overlay recipe pattern: enable the clamp imperatively.
    scrollRef.instance.setOptions({
      pinClamp: { tallerThan: 160, visibleHeight: 96 },
    })
    // An unrelated reactive option change re-fires the deep watcher. The
    // consumer never drove `pinClamp` declaratively, so the key must not
    // be sent (an explicit `undefined` would clear the clamp).
    optsRef.value = { strategy: 'pin-to-top', bottomThreshold: 200 }
    await wrapper.vm.$nextTick()
    expect(scrollRef.instance.options.bottomThreshold).toBe(200)
    expect(scrollRef.instance.options.pinClamp).toEqual({
      tallerThan: 160,
      visibleHeight: 96,
    })
    wrapper.unmount()
  })

  it('mirrors a reactive `streaming` ref into the controller', async () => {
    let scrollRef!: ReturnType<typeof useChatScroll>
    let loading!: ReturnType<typeof ref<boolean>>
    const Comp = defineComponent({
      setup() {
        loading = ref(false)
        const scroll = useChatScroll({ streaming: loading })
        scrollRef = scroll
        return () =>
          h('div', { ref: scroll.containerRef }, [
            h('div', { ref: scroll.contentRef }),
          ])
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.streaming).toBe(false)

    loading.value = true
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.streaming).toBe(true)

    loading.value = false
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.streaming).toBe(false)
    wrapper.unmount()
  })

  it('applies the initial `streaming` value on mount', async () => {
    let scrollRef!: ReturnType<typeof useChatScroll>
    const Comp = defineComponent({
      setup() {
        const scroll = useChatScroll({ streaming: true })
        scrollRef = scroll
        return () =>
          h('div', { ref: scroll.containerRef }, [
            h('div', { ref: scroll.contentRef }),
          ])
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.streaming).toBe(true)
    wrapper.unmount()
  })

  it('leaves the imperative path untouched when `streaming` is omitted', async () => {
    let scrollRef!: ReturnType<typeof useChatScroll>
    const Comp = defineComponent({
      setup() {
        const scroll = useChatScroll()
        scrollRef = scroll
        return () =>
          h('div', { ref: scroll.containerRef }, [
            h('div', { ref: scroll.contentRef }),
          ])
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.streaming).toBe(false)
    scrollRef.setStreaming(true)
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.streaming).toBe(true)
    wrapper.unmount()
  })

  it('forwards ChatScrollInstance methods', async () => {
    let scrollRef!: ReturnType<typeof useChatScroll>
    const Comp = defineComponent({
      setup() {
        const scroll = useChatScroll({ strategy: 'stick-to-bottom' })
        scrollRef = scroll
        return () =>
          h('div', { ref: scroll.containerRef }, [
            h('div', { ref: scroll.contentRef }),
          ])
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    scrollRef.unlock()
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.locked).toBe(false)
    scrollRef.lock()
    await wrapper.vm.$nextTick()
    expect(scrollRef.state.value.locked).toBe(true)
    wrapper.unmount()
  })

  it('re-exposes pin-to-top navigation methods', () => {
    const scroll = useChatScroll({ strategy: 'pin-to-top' })
    expect(typeof scroll.pinMessage).toBe('function')
    expect(typeof scroll.pinLatest).toBe('function')
    expect(typeof scroll.pinRelative).toBe('function')
    scroll.instance.destroy()
  })

  it('runs outside a component setup without throwing', () => {
    // Using outside of a Vue component: callers must clean up themselves.
    const scroll = useChatScroll()
    expect(scroll.state.value.atBottom).toBe(true)
    scroll.instance.destroy()
  })

  it('destroys instance on unmount', async () => {
    let destroySpy: ReturnType<typeof vi.spyOn> | null = null
    const Comp = defineComponent({
      setup() {
        const scroll = useChatScroll()
        destroySpy = vi.spyOn(scroll.instance, 'destroy')
        return () =>
          h('div', { ref: scroll.containerRef }, [
            h('div', { ref: scroll.contentRef }),
          ])
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    await wrapper.vm.$nextTick()
    wrapper.unmount()
    expect(destroySpy!).toHaveBeenCalled()
  })
})
