import { test, expect, hold, sendUserMessage, showCue } from '../../fixtures'

/**
 * PROBE: chat rendered inside a scrollable ancestor (nested scroll
 * containers). The chat is its own scroll container, AND it's inside
 * another scroll container that lays out alongside (e.g., a sidebar
 * layout where the main column scrolls vertically and contains a
 * chat panel inline with other content).
 *
 * Specific question: when the user scrolls the OUTER container (not
 * the chat), the chat's viewport position shifts. `getBoundingClientRect`
 * returns viewport-relative coordinates, so `cRect.top` and `gRect.top`
 * both shift by the same delta. The difference (which drives
 * `offsetWithin` and the gutter formula) should stay invariant.
 *
 * Risk: the outer scroll doesn't fire any of the chat container's
 * listeners. ResizeObserver doesn't fire (no size change). So no
 * recompute happens. That's fine IF the math is invariant. If anything
 * is using absolute viewport coordinates somewhere, the bug shows up
 * as a pin drift after the outer container scrolls.
 *
 * Also tests: after the outer scroll, do user inputs (wheel/touch) on
 * the chat still hit the chat's listeners correctly? Yes by event
 * targeting — but worth confirming in a recorded video.
 */
test('probe: chat inside a scrollable ancestor — pin math is invariant under outer scroll', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-anc]')) {
      // eslint-disable-next-line no-console
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // Wrap the existing `.chat` in a tall scrollable outer container so
  // the outer can be scrolled independently of the chat.
  await page.evaluate(() => {
    const app = document.getElementById('app')!
    const chat = app.querySelector<HTMLElement>('.chat')!
    const outer = document.createElement('div')
    outer.id = 'outer-scroll'
    // Outer scroll container has its OWN fixed height + vertical overflow.
    // Critically, the `.chat` panel inside needs an explicit definite
    // height — otherwise its inner `chat__scroll` `clientHeight` grows
    // unbounded and the gutter math goes wild (the library docs this
    // as the consumer's responsibility, but the failure mode is
    // ugly: a 100k-px gutter element). Realistic consumer code with
    // a sidebar/main layout always pins the chat panel to a definite
    // height block within the outer scroll.
    outer.style.cssText =
      'height: 540px; overflow-y: auto; padding: 0; ' +
      'background: #0c0c0c; border: 1px solid #2a2a2a; ' +
      'display: flex; flex-direction: column;'

    const padTop = document.createElement('div')
    padTop.style.cssText =
      'flex: 0 0 400px; padding: 16px; background: ' +
      'linear-gradient(180deg,#1d1d1d,#0c0c0c); color: #888;'
    padTop.textContent =
      'OUTER SCROLL: imagine this is the main app — a sidebar layout, a feed, ' +
      'a settings page — that hosts the chat panel below as one element among ' +
      'many. Scrolling THIS region does not touch the chat scroll. ↓'

    const padBot = document.createElement('div')
    padBot.style.cssText =
      'flex: 0 0 400px; padding: 16px; background: ' +
      'linear-gradient(180deg,#0c0c0c,#1d1d1d); color: #888;'
    padBot.textContent =
      'OUTER SCROLL: more page content below the chat. ↑'

    // Give the chat a definite height inside the outer flex column.
    chat.style.flex = '0 0 460px'
    chat.style.minHeight = '0'

    // Move chat into the new outer wrapper.
    outer.appendChild(padTop)
    outer.appendChild(chat)
    outer.appendChild(padBot)
    app.appendChild(outer)
  })
  await hold(page, 400)

  // Scroll the OUTER container so the chat is at the top of its viewport.
  await page.evaluate(() => {
    const outer = document.getElementById('outer-scroll')!
    const chat = outer.querySelector<HTMLElement>('.chat')!
    const oRect = outer.getBoundingClientRect()
    const cRect = chat.getBoundingClientRect()
    outer.scrollTop = cRect.top - oRect.top + outer.scrollTop - 8
  })
  await hold(page, 300)

  // Turn 1.
  await sendUserMessage(page)
  for (let i = 0; i < 50; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(50)
  }
  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 300)

  // Turn 2 — pin a fresh message.
  await sendUserMessage(page)
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => window.__demo?.tick())
    await page.waitForTimeout(80)
  }
  await hold(page, 500)

  const beforeOuterScroll = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ub = document
      .querySelectorAll<HTMLElement>('[data-test="user-msg"]')
      [document.querySelectorAll('[data-test="user-msg"]').length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    const g = c.querySelector<HTMLElement>('[data-chat-scroll-gutter]')!
    return {
      chatScrollTop: c.scrollTop,
      pinOffsetFromChatTop: u.top - s.top,
      pinnedY: u.top - s.top + c.scrollTop,
      gutterPx: parseFloat(g.style.height || '0'),
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-anc] BEFORE outer scroll: chatScrollTop=${beforeOuterScroll.chatScrollTop.toFixed(1)} ` +
      `pin offset within chat=${beforeOuterScroll.pinOffsetFromChatTop.toFixed(1)} ` +
      `pinnedY=${beforeOuterScroll.pinnedY.toFixed(1)} ` +
      `gutter=${beforeOuterScroll.gutterPx}`,
  )

  // Scroll the OUTER container by 200px (NOT the chat). This shifts
  // the chat's viewport position but should NOT affect any of its
  // internal scroll math.
  await showCue(page, 'scroll outer container 200px (chat unchanged)')
  await page.evaluate(() => {
    const outer = document.getElementById('outer-scroll')!
    outer.scrollBy({ top: 200, behavior: 'smooth' })
  })
  await hold(page, 700)

  const afterOuterScroll = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ub = document
      .querySelectorAll<HTMLElement>('[data-test="user-msg"]')
      [document.querySelectorAll('[data-test="user-msg"]').length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    return {
      chatScrollTop: c.scrollTop,
      pinOffsetFromChatTop: u.top - s.top,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-anc] AFTER outer scroll: chatScrollTop=${afterOuterScroll.chatScrollTop.toFixed(1)} ` +
      `pin offset within chat=${afterOuterScroll.pinOffsetFromChatTop.toFixed(1)}`,
  )

  // Now trigger a content resize WHILE in the outer-scrolled position.
  // The controller should still recompute the pin correctly against
  // the current rects — even though the outer scroll changed viewport
  // positions globally.
  await showCue(page, 'toggle a block while outer is scrolled')
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
      chatScrollTop: c.scrollTop,
      pinOffsetFromChatTop: u.top - s.top,
    }
  })
  // eslint-disable-next-line no-console
  console.log(
    `[probe-anc] AFTER block toggle with outer scrolled: ` +
      `chatScrollTop=${afterResize.chatScrollTop.toFixed(1)} ` +
      `pin offset within chat=${afterResize.pinOffsetFromChatTop.toFixed(1)}`,
  )

  await hold(page, 800)

  // ASSERTIONS:
  // - The chat's own scrollTop should be unchanged by outer scrolling.
  // - The pin's offset within the chat should stay at ~scrollMargin (12px).
  // - After a resize inside the outer-scrolled state, the pin should
  //   still be at ~scrollMargin.
  expect(Math.abs(afterOuterScroll.chatScrollTop - beforeOuterScroll.chatScrollTop)).toBeLessThan(2)
  expect(Math.abs(afterOuterScroll.pinOffsetFromChatTop - 12)).toBeLessThan(20)
  expect(Math.abs(afterResize.pinOffsetFromChatTop - 12)).toBeLessThan(20)
})
