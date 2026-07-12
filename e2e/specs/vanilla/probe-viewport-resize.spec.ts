import { test, expect, hold, sendUserMessage, showCue } from '../../fixtures'

/**
 * PROBE: viewport / container resize while a pin is active and the
 * gutter is non-zero (response shorter than viewport).
 *
 * Hypothesis: in `chat-scroll.ts`, the ResizeObserver only observes the
 * `content` element. The `container`'s `clientHeight` is also a load-
 * bearing input to gutter math:
 *
 *     gutter = max(0, pinnedY + container.clientHeight
 *                       - gutter.offsetTop - paddingBottom)
 *
 * When the window resizes (orientation change, DevTools opening, a
 * draggable splitter, mobile-keyboard appearing, ancestor CSS layout
 * change), `clientHeight` changes — but ResizeObserver fires only for
 * content. No callback runs; the gutter is not recomputed.
 *
 * The tight-pin contract `scrollHeight - clientHeight === pinnedY`
 * (i.e. the user can scroll the pinned message exactly to the top of
 * the viewport, no further) only applies when the response is shorter
 * than the viewport — i.e. when the gutter is actually doing something.
 * If the response is already longer than the viewport, the gutter is
 * 0 and the user naturally scrolls past pinnedY to read it; there's
 * nothing for the controller to defend.
 *
 * So this probe deliberately:
 *  - Sends one short stream (only a couple of ticks) so the response
 *    fits in the viewport and the gutter is non-zero.
 *  - Verifies the tight-pin contract BEFORE the viewport resize.
 *  - Resizes the viewport (shrink and grow).
 *  - Re-verifies the contract.
 *
 * If recalcGutter isn't triggered on viewport resize, the contract
 * will break — the user can either over-scroll past the pin (shrink)
 * or fail to scroll the pin to the top (grow).
 */
test('probe: viewport resize with short pinned response breaks tight-pin contract', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-resize]')) {
      console.log(t)
    }
  })

  await page.setViewportSize({ width: 960, height: 600 })
  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // Send a user message but DO NOT stream. The bot bubble is appended
  // but empty, so:
  //   content above pin (prior turns) + pinned user msg + empty bot
  //   < clientHeight
  // → the gutter is meaningfully non-zero and the tight-pin contract is
  // observable. (`finishStream` would write all body content, defeating
  // the test.)
  await sendUserMessage(page)
  await hold(page, 700)

  function measure(): Promise<{
    clientHeight: number
    scrollHeight: number
    scrollMax: number
    gutterPx: number
    pinnedY: number
    contractDelta: number
  }> {
    return page.evaluate(() => {
      const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
      const g = c.querySelector<HTMLElement>('[data-chat-scroll-gutter]')!
      const ubAll = document.querySelectorAll<HTMLElement>(
        '[data-test="user-msg"]',
      )
      const ub = ubAll[ubAll.length - 1]!
      const u = ub.getBoundingClientRect()
      const s = c.getBoundingClientRect()
      const pinnedY = u.top - s.top + c.scrollTop
      const scrollMax = c.scrollHeight - c.clientHeight
      return {
        clientHeight: c.clientHeight,
        scrollHeight: c.scrollHeight,
        scrollMax,
        gutterPx: parseFloat(g.style.height || '0'),
        pinnedY,
        contractDelta: scrollMax - pinnedY,
      }
    })
  }

  await showCue(page, 'short response — gutter should be non-zero now')
  const before = await measure()
  console.log(
    `[probe-resize] BEFORE: clientH=${before.clientHeight} ` +
      `scrollH=${before.scrollHeight} scrollMax=${before.scrollMax} ` +
      `gutter=${before.gutterPx} pinnedY=${before.pinnedY.toFixed(1)} ` +
      `Δ(scrollMax-pinnedY)=${before.contractDelta.toFixed(1)}`,
  )
  // Sanity: gutter should be non-zero (otherwise viewport resize is a
  // no-op and the test can't say anything useful). The delta-from-zero
  // is allowed to be small but non-zero — there are layout edge cases
  // (padding/margin between content and gutter) that shift it a bit.
  // What matters is that the delta should NOT MOVE across a viewport
  // resize: if recalcGutter is called, gutter shrinks/grows to keep
  // the contract; if it isn't, gutter stays stale and the delta moves
  // by ~the clientHeight change.
  expect(before.gutterPx).toBeGreaterThan(0)

  // ── Shrink the viewport ─────────────────────────────────────
  await showCue(page, 'viewport shrinks (e.g. DevTools opens)')
  await page.setViewportSize({ width: 960, height: 380 })
  await hold(page, 600)

  const afterShrink = await measure()
  console.log(
    `[probe-resize] SHRINK: clientH=${afterShrink.clientHeight} ` +
      `scrollH=${afterShrink.scrollHeight} scrollMax=${afterShrink.scrollMax} ` +
      `gutter=${afterShrink.gutterPx} pinnedY=${afterShrink.pinnedY.toFixed(1)} ` +
      `Δ(scrollMax-pinnedY)=${afterShrink.contractDelta.toFixed(1)}`,
  )

  // ── Grow the viewport ───────────────────────────────────────
  await showCue(page, 'viewport grows (e.g. user closes DevTools)')
  await page.setViewportSize({ width: 960, height: 800 })
  await hold(page, 600)

  const afterGrow = await measure()
  console.log(
    `[probe-resize] GROW:   clientH=${afterGrow.clientHeight} ` +
      `scrollH=${afterGrow.scrollHeight} scrollMax=${afterGrow.scrollMax} ` +
      `gutter=${afterGrow.gutterPx} pinnedY=${afterGrow.pinnedY.toFixed(1)} ` +
      `Δ(scrollMax-pinnedY)=${afterGrow.contractDelta.toFixed(1)}`,
  )

  await hold(page, 1000)

  // ASSERTIONS: the contract DELTA should be stable across resizes.
  // If gutter is recomputed on container resize, the delta stays near
  // `before.contractDelta`. If recalcGutter is never triggered, the
  // delta shifts by approximately the clientHeight change.
  //
  //   shrink: 600 → 380 = -220px
  //   grow:   380 → 800 = +420px
  //
  // Tolerance 10px allows the resize event to fire a scroll listener
  // that nudges measurements without recalcGutter being involved.
  const shrinkShift = afterShrink.contractDelta - before.contractDelta
  const growShift = afterGrow.contractDelta - afterShrink.contractDelta
  console.log(
    `[probe-resize] delta-shift on shrink: ${shrinkShift.toFixed(1)}px ` +
      `(expected ≈ 0 if recalcGutter ran on resize)`,
  )
  console.log(
    `[probe-resize] delta-shift on grow: ${growShift.toFixed(1)}px ` +
      `(expected ≈ 0 if recalcGutter ran on resize)`,
  )
  expect(Math.abs(shrinkShift)).toBeLessThan(10)
  expect(Math.abs(growShift)).toBeLessThan(10)
})
