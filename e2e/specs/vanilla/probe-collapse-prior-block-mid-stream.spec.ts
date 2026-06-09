import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
  streamN,
} from '../../fixtures'

/**
 * PROBE: while the bot is streaming with a pin active, the user
 * collapses a PRIOR turn's block above the pin. Content above the pin
 * SHRINKS — the opposite of the expandable-mid-stream case the existing
 * suite already covers.
 *
 * Hypothesis: `refreshPinnedY` should detect that the pin's absolute
 * offset within the container decreased (content shrank above it),
 * update `pinnedY`, recalculate the gutter, and — if `userWasAnchored`
 * — write `scrollTop = pinnedY` (the new, smaller pinnedY) so the user
 * visually stays at the pin.
 *
 * The risk: the browser also re-computes `scrollTop` when content
 * shrinks (clamping it to `scrollHeight - clientHeight`). Between the
 * browser's clamp and our synchronous write, there's a small window
 * where the layout flashes — or, in the worst case, the controller and
 * browser disagree about where the pin is and the user sees a "jump
 * down then back up" jitter.
 *
 * Specifically dangerous during streaming because `overflow-anchor:
 * none` is set, so the browser does NOT auto-anchor. Without our
 * `userWasAnchored` write, scrollTop would clamp to the new max-scroll
 * and the pin would visibly slide down the viewport (away from its
 * intended position at top + scrollMargin).
 *
 * Reproduction:
 *  1. Send turn 1, stream long enough that a tool block opens
 *     up (default-open by the demo).
 *  2. Finish stream.
 *  3. Send turn 2 — pin sits at top.
 *  4. Mid-stream of turn 2, collapse turn-1's first block (above pin).
 *  5. Measure the pin's viewport offset before/during/after.
 *
 * If the pin's viewport offset moves by more than a few pixels (i.e.
 * the pin visibly drifts), that's a bug.
 */
test('probe: collapsing a prior block mid-stream drifts the pin', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-collapse]')) {
      // eslint-disable-next-line no-console
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // Turn 1 — stream to completion so blocks exist above turn-2's pin.
  await sendUserMessage(page)
  for (let i = 0; i < 60; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(50)
  }
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 400)

  // Ensure block #0 (turn-1's first block) is open before turn 2 starts,
  // so collapsing it during turn-2's stream actually shrinks content.
  await page.evaluate(() => window.__demo?.expandBlock?.(0))
  await hold(page, 300)

  // Turn 2 — start streaming.
  await showCue(page, 'turn 2: pin engages, stream begins')
  await sendUserMessage(page)
  await streamN(page, 4, 100) // 4 chunks in, mid-stream

  const midStream = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ub = document
      .querySelectorAll<HTMLElement>('[data-test="user-msg"]')
      [document.querySelectorAll('[data-test="user-msg"]').length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    const g = c.querySelector<HTMLElement>('[data-chat-scroll-gutter]')!
    return {
      scrollTop: c.scrollTop,
      pinOffsetFromTop: u.top - s.top,
      gutterPx: parseFloat(g.style.height || '0'),
      scrollHeight: c.scrollHeight,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-collapse] mid-stream BEFORE collapse: ` +
      `scrollTop=${midStream.scrollTop.toFixed(1)} ` +
      `pin offset from viewport top=${midStream.pinOffsetFromTop.toFixed(1)} ` +
      `gutter=${midStream.gutterPx} scrollH=${midStream.scrollHeight}`,
  )

  // Collapse turn-1's first block (above the pin) WHILE streaming.
  await showCue(page, 'collapse prior block (content above pin SHRINKS)')
  await page.evaluate(() => window.__demo?.collapseBlock?.(0))

  // The block animation runs ~220ms. RO fires across it.
  await hold(page, 400)

  // A few more chunks to keep the resize observer busy.
  await streamN(page, 3, 100)

  const afterCollapse = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ub = document
      .querySelectorAll<HTMLElement>('[data-test="user-msg"]')
      [document.querySelectorAll('[data-test="user-msg"]').length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    const g = c.querySelector<HTMLElement>('[data-chat-scroll-gutter]')!
    return {
      scrollTop: c.scrollTop,
      pinOffsetFromTop: u.top - s.top,
      gutterPx: parseFloat(g.style.height || '0'),
      scrollHeight: c.scrollHeight,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-collapse] AFTER collapse: ` +
      `scrollTop=${afterCollapse.scrollTop.toFixed(1)} ` +
      `pin offset from viewport top=${afterCollapse.pinOffsetFromTop.toFixed(1)} ` +
      `gutter=${afterCollapse.gutterPx} scrollH=${afterCollapse.scrollHeight}`,
  )

  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 800)

  // ASSERTION: the pin offset from viewport top should stay near
  // scrollMargin (12px). If the pin drifted, this delta exposes the bug.
  const driftFromIntended = Math.abs(afterCollapse.pinOffsetFromTop - 12)
  // eslint-disable-next-line no-console
  console.log(
    `[probe-collapse] pin drift from intended (12px) = ` +
      `${driftFromIntended.toFixed(1)}px`,
  )
  expect(driftFromIntended).toBeLessThan(8)
})
