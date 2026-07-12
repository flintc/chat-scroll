import { beforeEach, describe, expect, test } from 'vitest'

import { animateScrollTo, easeOutExpo } from '../src/smooth-scroll'

describe('easeOutExpo', () => {
  test('0 maps to 0', () => {
    expect(easeOutExpo(0)).toBe(0)
  })

  test('1 maps to 1', () => {
    expect(easeOutExpo(1)).toBe(1)
  })

  test('strictly monotonic on (0, 1)', () => {
    let prev = -Infinity
    for (let i = 0; i <= 100; i++) {
      const v = easeOutExpo(i / 100)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  test('decelerates: progress past midpoint is greater than midpoint', () => {
    expect(easeOutExpo(0.5)).toBeGreaterThan(0.5)
  })

  test('clamps inputs outside [0, 1]', () => {
    expect(easeOutExpo(-0.1)).toBe(0)
    expect(easeOutExpo(1.5)).toBe(1)
  })
})

describe('animateScrollTo', () => {
  let nowMs = 0
  let frames: FrameRequestCallback[] = []
  let cancelled: Set<number> = new Set()

  beforeEach(() => {
    nowMs = 0
    frames = []
    cancelled = new Set()
  })

  const raf = (cb: FrameRequestCallback): number => {
    frames.push(cb)
    return frames.length
  }
  const caf = (id: number): void => {
    cancelled.add(id)
  }
  const tick = (deltaMs: number): void => {
    nowMs += deltaMs
    const pending = frames.splice(0)
    pending.forEach((cb, i) => {
      const id = i + 1
      if (!cancelled.has(id)) cb(nowMs)
    })
  }

  type ScrollEl = {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
  }
  const makeEl = (opts: Partial<ScrollEl> = {}): ScrollEl => ({
    scrollTop: opts.scrollTop ?? 0,
    scrollHeight: opts.scrollHeight ?? 1000,
    clientHeight: opts.clientHeight ?? 400,
  })

  test('reduced motion sets scrollTop instantly without scheduling a frame', async () => {
    const el = makeEl({ scrollHeight: 1000, clientHeight: 400 })
    await animateScrollTo(el, 250, {
      reducedMotion: true,
      raf,
      caf,
      now: () => nowMs,
    })
    expect(el.scrollTop).toBe(250)
    expect(frames.length).toBe(0)
  })

  test('clamps instant target to (scrollHeight - clientHeight)', async () => {
    const el = makeEl({ scrollHeight: 500, clientHeight: 400 })
    await animateScrollTo(el, 9999, {
      reducedMotion: true,
      raf,
      caf,
      now: () => nowMs,
    })
    expect(el.scrollTop).toBe(100)
  })

  test('animates monotonically from start to target across duration', async () => {
    const el = makeEl({ scrollHeight: 1000, clientHeight: 400 })
    const promise = animateScrollTo(el, 200, {
      duration: 100,
      now: () => nowMs,
      raf,
      caf,
    })

    tick(0)
    expect(el.scrollTop).toBe(0)

    tick(50)
    const midway = el.scrollTop
    expect(midway).toBeGreaterThan(0)
    expect(midway).toBeLessThan(200)
    // expo-out is decelerating: more than half traveled by half-time
    expect(midway).toBeGreaterThan(100)

    tick(50)
    expect(el.scrollTop).toBe(200)

    await promise
  })

  // Regression guard for the iOS Safari race documented at top of
  // smooth-scroll.ts. Native scrollTo({behavior: 'smooth'}) on a nested
  // overflow container clamps to stale scrollHeight when a same-frame
  // style write resizes a sibling (the gutter). Our rAF loop must
  // re-clamp every frame against live scrollHeight.
  test('re-clamps to live scrollHeight each frame (Safari gutter race)', async () => {
    const el = makeEl({ scrollHeight: 500, clientHeight: 400 })
    const promise = animateScrollTo(el, 300, {
      duration: 100,
      now: () => nowMs,
      raf,
      caf,
    })

    tick(0)
    tick(50)
    expect(el.scrollTop).toBeLessThanOrEqual(100)

    el.scrollHeight = 1000

    tick(50)
    expect(el.scrollTop).toBe(300)
    await promise
  })

  test('AbortSignal stops the animation; scrollTop frozen at last frame', async () => {
    const ac = new AbortController()
    const el = makeEl()
    const promise = animateScrollTo(el, 400, {
      duration: 100,
      signal: ac.signal,
      now: () => nowMs,
      raf,
      caf,
    })

    tick(0)
    tick(30)
    const beforeAbort = el.scrollTop
    expect(beforeAbort).toBeGreaterThan(0)

    ac.abort()
    tick(70)
    expect(el.scrollTop).toBe(beforeAbort)
    await promise
  })

  test('AbortSignal aborted before start: no scroll change, no frames', async () => {
    const ac = new AbortController()
    ac.abort()
    const el = makeEl({ scrollTop: 12 })
    await animateScrollTo(el, 400, {
      signal: ac.signal,
      now: () => nowMs,
      raf,
      caf,
    })
    expect(el.scrollTop).toBe(12)
    expect(frames.length).toBe(0)
  })

  test('zero distance: resolves immediately, no frames scheduled', async () => {
    const el = makeEl({ scrollTop: 100 })
    await animateScrollTo(el, 100, {
      duration: 100,
      now: () => nowMs,
      raf,
      caf,
    })
    expect(el.scrollTop).toBe(100)
    expect(frames.length).toBe(0)
  })

  // Regression guard: a constant `target` made the
  // animation land at the captured value, so when content above the
  // pin grew mid-animation the pin ended up visually low. With a
  // getter, the animation re-reads target each frame.
  test('getter target: animation tracks a moving target across frames', async () => {
    const el = makeEl({ scrollHeight: 2000, clientHeight: 400 })
    let target = 200
    const promise = animateScrollTo(el, () => target, {
      duration: 100,
      now: () => nowMs,
      raf,
      caf,
    })

    tick(0)
    tick(50)
    const halfway = el.scrollTop
    expect(halfway).toBeGreaterThan(0)
    expect(halfway).toBeLessThanOrEqual(200)

    // Content above the pin grows by 200 → target shifts. The
    // animation resets its `start` + `startTime` to keep motion
    // continuous, so a full new duration is required to land.
    target = 400

    // Tick out the full re-anchored duration. The target shift resets
    // start/startTime to keep motion continuous, so a fresh `duration`
    // is needed to land at the new target. Tick well past the duration
    // to ensure t reaches 1 and the animation resolves.
    tick(50) // sees target moved, resets start; t becomes 0
    tick(50) // mid re-anchored animation
    tick(60) // past duration → t=1, final frame writes target exactly
    // Without the getter, this would land at 200.
    expect(el.scrollTop).toBe(400)
    await promise
  })

  test('getter target: target shift mid-animation does not produce a visible jump', async () => {
    const el = makeEl({ scrollHeight: 2000, clientHeight: 400 })
    let target = 200
    const promise = animateScrollTo(el, () => target, {
      duration: 100,
      now: () => nowMs,
      raf,
      caf,
    })

    tick(0)
    tick(50)
    const beforeShift = el.scrollTop

    // Shift target a tiny bit. With the start/startTime reset, the
    // next frame's scrollTop should be near `beforeShift`, NOT a
    // sudden jump caused by re-evaluating eased * (newTarget - start).
    target = 250

    tick(5)
    const afterShift = el.scrollTop
    expect(Math.abs(afterShift - beforeShift)).toBeLessThan(20)
    // Complete the re-anchored animation so the awaited promise resolves.
    tick(50)
    tick(50)
    await promise
  })

  test('getter target: respects reduced-motion path (one-shot, evaluated once)', async () => {
    const el = makeEl({ scrollHeight: 1000, clientHeight: 400 })
    let calls = 0
    await animateScrollTo(
      el,
      () => {
        calls += 1
        return 250
      },
      {
        reducedMotion: true,
        raf,
        caf,
        now: () => nowMs,
      },
    )
    expect(el.scrollTop).toBe(250)
    expect(calls).toBe(1)
  })
})
