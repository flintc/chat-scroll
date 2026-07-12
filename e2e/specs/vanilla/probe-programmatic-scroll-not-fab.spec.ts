import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
} from '../../fixtures'

/**
 * PROBE: a consumer's OWN programmatic scroll (not the controller's
 * `scrollToBottom()`, not a wheel/touch/keyboard event) leaves
 * `pinAnchored = true`, so the next content resize snaps the user back
 * to the pin.
 *
 * Root cause hypothesis: `pinAnchored` is cleared by two paths only:
 *  1. The user-input cancellers: wheel, touchmove, scroll-driving keys.
 *  2. The controller's own `scrollToBottom()`.
 *
 * If a consumer writes `container.scrollTo({ top: X, behavior: 'smooth' })`
 * to (say) deep-link to a search result, scroll to a saved offset,
 * focus a particular message via a sidebar link, or implement a
 * "scroll up half a screen" hotkey — none of those go through the
 * cancellers OR the controller. `pinAnchored` stays true. The next
 * resize (e.g. a late stream chunk, a layout shift, an image loading)
 * snaps them back to the pin.
 *
 * This is the same family of bug as the FAB / `scrollToBottom()` case,
 * but the trigger is
 * generic, more common in real apps, and harder to "fix" inside the
 * controller because the consumer's call is opaque to us.
 *
 * Reproduction:
 *  1. Pin a user message (turn 2 after a turn 1).
 *  2. Wait for animation to settle.
 *  3. Consumer code: `container.scrollTo({ top: 0, behavior: 'smooth' })`
 *     to "jump to top".
 *  4. After the scroll settles, expand a prior block (or just wait for
 *     a resize event to fire — we do an explicit expand to be deterministic).
 *  5. If the user is yanked back to the pin: bug confirmed.
 */
test('probe: programmatic scrollTo leaves pinAnchored stale, snaps back on resize', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-prog]')) {
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // Turn 1.
  await sendUserMessage(page)
  for (let i = 0; i < 60; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(50)
  }
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 400)

  // Turn 2 — pin and finish.
  await sendUserMessage(page)
  for (let i = 0; i < 60; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(50)
  }
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 600)

  const pinnedYNow = await page.evaluate(() => {
    const ubAll = document.querySelectorAll<HTMLElement>('[data-test="user-msg"]')
    const ub = ubAll[ubAll.length - 1]!
    const sb = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const u = ub.getBoundingClientRect()
    const s = sb.getBoundingClientRect()
    return u.top - s.top + sb.scrollTop
  })
  console.log(`[probe-prog] pinnedY ≈ ${pinnedYNow.toFixed(1)}`)

  // Consumer-driven programmatic scroll — NOT via `__demo.scrollByPx`
  // (which calls scrollBy, which fires a scroll event but no wheel/touch).
  // Use `container.scrollTo` directly to jump to top, simulating a
  // "scroll to top" deep-link / hotkey / sidebar navigation.
  await showCue(page, 'consumer code: container.scrollTo(0) — NOT FAB, NOT wheel')
  await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    c.scrollTo({ top: 0, behavior: 'smooth' })
  })
  await hold(page, 700)

  const afterJump = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return { scrollTop: c.scrollTop, scrollMax: c.scrollHeight - c.clientHeight }
  })
  console.log(
    `[probe-prog] after programmatic scrollTo(0): ` +
      `scrollTop=${afterJump.scrollTop.toFixed(1)} ` +
      `scrollMax=${afterJump.scrollMax}`,
  )

  // Trigger a real resize. Blocks default to OPEN by the end of
  // streaming, so `expandBlock` would be a no-op. Use `toggleBlock` to
  // guarantee a content-height change which fires the ResizeObserver.
  // With the bug, the RO callback triggers `recalcGutter`, which sees
  // `userWasAnchored=true` and writes `scrollTop = pinnedY`, yanking
  // the user back DOWN to the pin.
  await showCue(page, 'toggle a prior block (causes real resize)')
  await page.evaluate(() => window.__demo?.toggleBlock?.(0))
  await hold(page, 600)

  const afterExpand = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return { scrollTop: c.scrollTop, scrollMax: c.scrollHeight - c.clientHeight }
  })
  console.log(
    `[probe-prog] after block expand: ` +
      `scrollTop=${afterExpand.scrollTop.toFixed(1)} ` +
      `scrollMax=${afterExpand.scrollMax} ` +
      `(if scrollTop jumped back ~${pinnedYNow.toFixed(0)} → bug confirmed)`,
  )

  await hold(page, 1000)

  // ASSERTION: the user navigated themselves to scrollTop=0 (top of the
  // chat) and only opened a prior block — nothing about that should
  // change scroll position by more than a small layout-shift amount.
  // With the bug, the resize callback writes `scrollTop = pinnedY`,
  // snapping the user back HUNDREDS of pixels to the pin.
  const snapBackDelta = afterExpand.scrollTop - afterJump.scrollTop
  console.log(
    `[probe-prog] snap-back delta after resize = ${snapBackDelta.toFixed(1)}px ` +
      `(expected ≈ 0 if pinAnchored had been cleared by the scrollTo)`,
  )
  expect(Math.abs(snapBackDelta)).toBeLessThan(40)
})
