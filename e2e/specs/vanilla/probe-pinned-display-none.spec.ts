import { test, expect, hold, sendUserMessage, showCue } from '../../fixtures'

/**
 * PROBE: the pinned element gets `display: none` (e.g. consumer applies
 * a filter, hides a message via a flag, or animates it out).
 *
 * Hypothesis: `refreshPinnedY` reads `ctx.pinnedEl.getBoundingClientRect()`
 * which returns `{ top: 0, left: 0, width: 0, ... }` when the element
 * has `display: none`. The pin's `top` collapses to 0 (or to whatever
 * the container's top is), so:
 *
 *    pinnedY = max(0, offsetWithin(...) - scrollMargin)
 *            = max(0, (0 - cRect.top + scrollTop) - 12)
 *
 * which gives a nonsense value that's bounded only by scrollTop. The
 * gutter is then recomputed against this nonsense `pinnedY`, which can
 * either zero out the gutter or balloon it. The visual effect: chat
 * either yanks to top, snaps somewhere unexpected, or the user can
 * over-scroll past where the pin used to be.
 *
 * `ctx.container.contains(ctx.pinnedEl)` is still TRUE when display:none
 * — the element is in the DOM. The early-return only triggers when the
 * node is detached.
 *
 * Real-world trigger: a chat with a "hide system messages" toggle, a
 * filter that hides assistant errors, or even Solid/Vue moving an
 * element to a Portal would all surface this.
 */
test('probe: hiding the pinned element with display:none corrupts gutter math', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-dn]')) {
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // One turn so there's a pinned message.
  await sendUserMessage(page)
  // Stream just a couple chunks so the gutter is meaningfully non-zero
  // (response shorter than viewport).
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.__demo?.tick())
    await page.waitForTimeout(80)
  }
  await hold(page, 600)

  const before = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const g = c.querySelector<HTMLElement>('[data-chat-scroll-gutter]')!
    const ubAll = document.querySelectorAll<HTMLElement>(
      '[data-test="user-msg"]',
    )
    const ub = ubAll[ubAll.length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    return {
      scrollTop: c.scrollTop,
      scrollHeight: c.scrollHeight,
      clientHeight: c.clientHeight,
      gutterPx: parseFloat(g.style.height || '0'),
      pinnedYReal: u.top - s.top + c.scrollTop,
      contractDelta:
        c.scrollHeight - c.clientHeight - (u.top - s.top + c.scrollTop),
    }
  })
  console.log(
    `[probe-dn] BEFORE: scrollTop=${before.scrollTop.toFixed(1)} ` +
      `scrollMax=${(before.scrollHeight - before.clientHeight).toFixed(1)} ` +
      `gutter=${before.gutterPx} pinnedY=${before.pinnedYReal.toFixed(1)} ` +
      `Δ=${before.contractDelta.toFixed(1)}`,
  )

  await showCue(page, 'consumer hides the pinned message (display:none)')
  // Hide the pinned user message — pretend a "hide system msgs" toggle.
  await page.evaluate(() => {
    const ubs = document.querySelectorAll<HTMLElement>('[data-test="user-msg"]')
    const lastU = ubs[ubs.length - 1]!
    lastU.style.display = 'none'
  })

  // The ResizeObserver fires because content height changed.
  await hold(page, 400)

  const afterHide = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const g = c.querySelector<HTMLElement>('[data-chat-scroll-gutter]')!
    return {
      scrollTop: c.scrollTop,
      scrollHeight: c.scrollHeight,
      clientHeight: c.clientHeight,
      gutterPx: parseFloat(g.style.height || '0'),
      contractDelta: c.scrollHeight - c.clientHeight,
    }
  })
  console.log(
    `[probe-dn] AFTER HIDE: scrollTop=${afterHide.scrollTop.toFixed(1)} ` +
      `scrollMax=${(afterHide.scrollHeight - afterHide.clientHeight).toFixed(1)} ` +
      `gutter=${afterHide.gutterPx} ` +
      `contractDelta (scrollMax)=${afterHide.contractDelta.toFixed(1)}`,
  )

  await showCue(page, 'show pinned message again — does pin land where it was?')
  // Restore visibility — does the controller recover or stay broken?
  await page.evaluate(() => {
    const ubs = document.querySelectorAll<HTMLElement>('[data-test="user-msg"]')
    const lastU = ubs[ubs.length - 1]!
    lastU.style.display = ''
  })
  await hold(page, 600)

  const afterShow = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const g = c.querySelector<HTMLElement>('[data-chat-scroll-gutter]')!
    const ubAll = document.querySelectorAll<HTMLElement>(
      '[data-test="user-msg"]',
    )
    const ub = ubAll[ubAll.length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    return {
      scrollTop: c.scrollTop,
      scrollHeight: c.scrollHeight,
      clientHeight: c.clientHeight,
      gutterPx: parseFloat(g.style.height || '0'),
      pinnedYReal: u.top - s.top + c.scrollTop,
      offsetFromViewportTop: u.top - s.top,
    }
  })
  console.log(
    `[probe-dn] AFTER SHOW: scrollTop=${afterShow.scrollTop.toFixed(1)} ` +
      `pinnedY(real)=${afterShow.pinnedYReal.toFixed(1)} ` +
      `pin offset from viewport top=${afterShow.offsetFromViewportTop.toFixed(1)} ` +
      `gutter=${afterShow.gutterPx}`,
  )

  await hold(page, 1000)

  // Assertion: pin should be near the top of the viewport (≈ scrollMargin=12).
  // If display:none corrupted the pinnedY and the controller didn't
  // recover, this will be wildly off.
  expect(Math.abs(afterShow.offsetFromViewportTop - 12)).toBeLessThan(20)
})
