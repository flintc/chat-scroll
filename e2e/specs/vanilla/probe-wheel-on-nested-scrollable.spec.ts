import { test, expect, hold, sendUserMessage, showCue } from '../../fixtures'

/**
 * PROBE: a user wheels (or touch-pans) over a SCROLLABLE descendant of
 * the chat — e.g. a horizontally-scrolling code block, a table inside
 * a bot message, an inner carousel — and the wheel event bubbles up to
 * the chat container. The container's wheel listener treats the event
 * as `scrollDriving`, clearing `pinAnchored`. But the chat itself
 * didn't scroll (the wheel was consumed by the inner element); the
 * user's intent was to scroll the inner thing.
 *
 * Two clearly-visible cases:
 *
 *  A) HORIZONTAL wheel (deltaX, deltaY=0) on a horizontally-scrollable
 *     inner element. The chat has no horizontal scroll, so deltaY=0
 *     doesn't move the chat at all. But the wheel event fires on the
 *     chat container's listener, so `pinAnchored → false`. A subsequent
 *     resize (block expand, image load, stream tick) then does NOT
 *     snap the user back to the pin — even though they never scrolled
 *     the chat away from the pin.
 *
 *  B) VERTICAL wheel that's fully consumed by a nested vertical
 *     scroll (e.g. a fixed-height log panel inside a bot message
 *     that's reached neither edge yet). Chrome decides not to chain
 *     to the chat, so the chat's `scrollTop` doesn't move. But the
 *     wheel event still bubbles to the chat container's listener.
 *     `pinAnchored → false`.
 *
 * We test case A here — it's the clearest, hardest-to-mistake repro.
 * Real-world trigger: AI chat with code blocks containing wide code
 * lines that the user pans horizontally to read.
 */
test('probe: horizontal wheel on inner scrollable inside a message clears pinAnchored', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-nest]')) {
      // eslint-disable-next-line no-console
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // Turn 1.
  await sendUserMessage(page)
  for (let i = 0; i < 50; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(50)
  }
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 300)

  // Turn 2 — pin the next user message.
  await sendUserMessage(page)
  for (let i = 0; i < 40; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(50)
  }
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 500)

  // Inject the wide code-block into turn 2's bot reply, right under
  // the pin so it's visible WITHOUT scrolling. (If we positioned it
  // above the pin, we'd need either a programmatic scroll — which the
  // controller correctly clears `pinAnchored` for — or a wheel
  // up-scroll, which the cancellers also clear `pinAnchored` for. To
  // isolate the nested-scrollable case we need the wide-code visible while `pinAnchored`
  // remains true; below-the-pin placement satisfies that.)
  await page.evaluate(() => {
    const bots = document.querySelectorAll<HTMLElement>(
      '[data-test="bot-msg"]',
    )
    const lastBot = bots[bots.length - 1]!
    const wide = document.createElement('pre')
    wide.dataset.test = 'wide-code'
    wide.style.cssText =
      'overflow-x: auto; white-space: pre; padding: 8px 12px; ' +
      'background: #1a1a1a; color: #ddd; border-radius: 6px; ' +
      'font-family: ui-monospace, monospace; font-size: 12px; ' +
      'margin-top: 8px;'
    // 600+ chars on one line so horizontal scroll is required.
    wide.textContent =
      'const veryLongIdentifier = computePipelineConfigurationForFeatureFlagWithFallbackToDefaultStrategyAndRetryPolicyAttachedToTheNetworkLayerImplementationWhichWeUseInTheBackendForResolvingUserPreferencesAtRuntimeBasedOnAccountTierAndOrgSettingsAndExperimentAssignments(); // line continues with even more identifiers spanning past the viewport width to force the user to scroll the inner element horizontally and never the chat container itself.'
    lastBot.insertBefore(wide, lastBot.firstChild)
  })
  await hold(page, 400)

  // Capture chat scrollTop BEFORE the horizontal wheel.
  const beforeWheel = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const wide = document.querySelector<HTMLElement>(
      '[data-test="wide-code"]',
    )!
    return {
      chatScrollTop: c.scrollTop,
      innerScrollLeft: wide.scrollLeft,
    }
  })

  // HORIZONTAL wheel over the inner code block. deltaY = 0.
  await showCue(page, 'user horizontally pans code block (deltaY=0)')
  const codeBox = await page.locator('[data-test="wide-code"]').boundingBox()
  if (codeBox) {
    await page.mouse.move(
      codeBox.x + codeBox.width / 2,
      codeBox.y + codeBox.height / 2,
    )
    // Several horizontal wheel events so the inner element scrolls and
    // the chat container's `wheel` listener fires multiple times.
    for (let i = 0; i < 5; i += 1) {
      await page.mouse.wheel(80, 0)
      await page.waitForTimeout(40)
    }
  }
  await hold(page, 300)

  // Capture immediately after the horizontal wheel: chat scrollTop
  // should be unchanged (no vertical movement at all). The inner code
  // block's scrollLeft SHOULD have moved.
  const afterWheel = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const wide = document.querySelector<HTMLElement>(
      '[data-test="wide-code"]',
    )!
    return {
      chatScrollTop: c.scrollTop,
      innerScrollLeft: wide.scrollLeft,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-nest] before wheel: chatTop=${beforeWheel.chatScrollTop.toFixed(1)} ` +
      `innerLeft=${beforeWheel.innerScrollLeft.toFixed(1)}`,
  )
  // eslint-disable-next-line no-console
  console.log(
    `[probe-nest] after horizontal wheel: chatTop=${afterWheel.chatScrollTop.toFixed(1)} ` +
      `innerLeft=${afterWheel.innerScrollLeft.toFixed(1)} ` +
      `(chat should be UNCHANGED; inner code SHOULD have moved)`,
  )

  // Now trigger a content resize (toggle a block) — if `pinAnchored`
  // was falsely cleared by the horizontal wheel, the controller will
  // NOT re-anchor the pin to its pinnedY. If `pinAnchored` is still
  // true, the controller WILL re-anchor.
  await showCue(page, 'toggle a block — does the controller re-anchor pin?')
  await page.evaluate(() => window.__demo?.toggleBlock?.(1))
  await hold(page, 600)

  const afterResize = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ub = document
      .querySelectorAll<HTMLElement>('[data-test="user-msg"]')
      [document.querySelectorAll('[data-test="user-msg"]').length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    return {
      scrollTop: c.scrollTop,
      pinOffsetFromViewportTop: u.top - s.top,
      pinnedYReal: u.top - s.top + c.scrollTop,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-nest] after resize: scrollTop=${afterResize.scrollTop.toFixed(1)} ` +
      `pin offset from viewport top=${afterResize.pinOffsetFromViewportTop.toFixed(1)} ` +
      `pinnedY(real)=${afterResize.pinnedYReal.toFixed(1)} ` +
      `(if pin offset is FAR from 12: pinAnchored was falsely cleared)`,
  )

  await hold(page, 800)

  // ASSERTION: after the resize, the controller should have re-anchored
  // the pin to scrollMargin (~12px from viewport top). If the
  // horizontal wheel falsely cleared pinAnchored, the controller won't
  // re-anchor and pin's viewport offset will be elsewhere.
  expect(Math.abs(afterResize.pinOffsetFromViewportTop - 12)).toBeLessThan(20)
})
