import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
  streamN,
} from '../../fixtures'

/**
 * PROBE: stick-to-bottom strategy, a message is REMOVED from the
 * middle of the DOM while the controller is locked + streaming.
 *
 * Real-world trigger: consumer-driven message editing (delete a stale
 * tool call), retracting an in-flight bot reply, "regenerate response"
 * which removes the old response before streaming a new one. All very
 * common in production chat UIs.
 *
 * Hypothesis: `stick-to-bottom`'s `onContentResize` is gated on
 * `locked && streaming` and writes `scrollTop = scrollHeight`. That's
 * fine when content GROWS. When content SHRINKS, the browser clamps
 * `scrollTop` to `scrollHeight - clientHeight` BEFORE the RO callback
 * runs. The clamp itself fires a scroll event, which `onScroll`
 * processes:
 *
 *   if (locked && !isAtBottom(...)) locked = false
 *
 * — depending on timing, the synthetic post-clamp scroll event can race
 * with the RO callback. If `onScroll` fires after the clamp but BEFORE
 * the RO restores us to the new bottom, `isAtBottom` may be false at
 * that instant and we silently unlock. The next stream tick would NOT
 * re-snap to bottom (we just lost the lock), and the user sees the
 * chat detach from the live bottom mid-stream.
 *
 * Reproduction:
 *  1. Send a user message → start streaming, locked.
 *  2. Stream a few chunks — confirm we're at the bottom.
 *  3. Remove a middle message from DOM (scrollHeight shrinks).
 *  4. Continue streaming.
 *  5. Inspect `locked` and `atBottom` and the actual scrollTop relative
 *     to the bottom.
 *
 * Bug signature: after the shrink, atBottom should remain true and we
 * should keep auto-scrolling. If atBottom flips to false even briefly,
 * or scrollTop deviates from scrollMax during the remaining stream, the
 * lock has dropped silently.
 */
test('probe: stick-to-bottom mid-stream DOM shrink silently unlocks', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-shrink]')) {
      // eslint-disable-next-line no-console
      console.log(t)
    }
  })

  await page.goto('/#/stick-to-bottom')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 600)

  // Send a user message → start a stream.
  await showCue(page, 'send → stick + stream begins')
  await sendUserMessage(page)
  await streamN(page, 6, 90)

  const midStream = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return {
      scrollTop: c.scrollTop,
      scrollMax: c.scrollHeight - c.clientHeight,
      msgCount: c.querySelectorAll('.msg').length,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-shrink] mid-stream: scrollTop=${midStream.scrollTop.toFixed(1)} ` +
      `scrollMax=${midStream.scrollMax.toFixed(1)} ` +
      `dist=${(midStream.scrollMax - midStream.scrollTop).toFixed(1)} ` +
      `msgs=${midStream.msgCount}`,
  )

  // Remove a middle message — simulate "regenerate" / "edit" / "retract".
  await showCue(page, 'remove a middle msg (DOM shrinks under live stream)')
  await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-test="list"]')!
    // Remove a message that's not the first and not the last few — leave
    // user's most-recent msg + bot's in-progress reply intact.
    const msgs = Array.from(list.querySelectorAll<HTMLElement>('.msg'))
    const victim = msgs[Math.floor(msgs.length / 2)]
    victim?.remove()
  })

  // Keep streaming chunks while RO fires across the shrink.
  await streamN(page, 8, 90)
  await hold(page, 400)

  const afterShrink = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return {
      scrollTop: c.scrollTop,
      scrollMax: c.scrollHeight - c.clientHeight,
      dist: c.scrollHeight - c.scrollTop - c.clientHeight,
      msgCount: c.querySelectorAll('.msg').length,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-shrink] after shrink + more stream: ` +
      `scrollTop=${afterShrink.scrollTop.toFixed(1)} ` +
      `scrollMax=${afterShrink.scrollMax.toFixed(1)} ` +
      `dist=${afterShrink.dist.toFixed(1)} ` +
      `msgs=${afterShrink.msgCount}`,
  )

  // Drain.
  for (let i = 0; i < 30; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(80)
  }
  await hold(page, 600)

  const final = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    return {
      scrollTop: c.scrollTop,
      scrollMax: c.scrollHeight - c.clientHeight,
      dist: c.scrollHeight - c.scrollTop - c.clientHeight,
      msgCount: c.querySelectorAll('.msg').length,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-shrink] FINAL: ` +
      `scrollTop=${final.scrollTop.toFixed(1)} ` +
      `scrollMax=${final.scrollMax.toFixed(1)} ` +
      `dist=${final.dist.toFixed(1)} ` +
      `msgs=${final.msgCount}`,
  )

  await hold(page, 600)

  // ASSERTION: at the end of streaming, we should be at the bottom
  // (within the default bottomThreshold = 40).
  expect(final.dist).toBeLessThan(40)
})
