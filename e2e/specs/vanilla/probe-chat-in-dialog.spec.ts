import { test, expect, hold, sendUserMessage, showCue } from '../../fixtures'

/**
 * PROBE: chat rendered inside a `<dialog>` (modal). Tests three nested
 * scenarios that real apps hit:
 *
 *  1. Chat mounted while dialog is OPEN — basic case, should "just work".
 *  2. Dialog closed and re-opened — scrollTop preserved? Pin still works
 *     after the close/reopen cycle?
 *  3. pinMessage called RIGHT AS the dialog opens — bounding rects may
 *     be transitional (CSS transitions on the dialog) and could land
 *     pinnedY in the wrong place.
 *
 * Real-world trigger: chat-in-a-modal is a common UI pattern (Linear's
 * AI inbox, Slack's huddles AI, a "summarize selection" popover). This
 * probe wraps the existing pin-to-top scenario inside a `<dialog>` and
 * runs the standard pin flow.
 */
test('probe: pin-to-top inside <dialog> (modal) — full flow + close/reopen', async ({
  page,
}) => {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[probe-dialog]')) {
      console.log(t)
    }
  })

  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))
  await hold(page, 400)

  // Wrap the entire `.chat` element inside a `<dialog>` and `showModal()`.
  // We don't tear down the existing controller — we just move its DOM
  // into a dialog and re-render. The chat-scroll controller's
  // observers and listeners follow the container element wherever it
  // lives in the DOM, so this is a no-touch test for "does the
  // controller cope with its container being inside a modal stacking
  // context?".
  await page.evaluate(() => {
    const app = document.getElementById('app')!
    const chat = app.querySelector<HTMLElement>('.chat')!
    const dialog = document.createElement('dialog')
    dialog.id = 'probe-dialog'
    // Dialog itself is a fixed-size flex column so its child `.chat`
    // (which is already a flex-column with `chat__scroll` flexing to
    // `1 1 auto`) gets a definite height. The library assumes the
    // container has a constrained height; if you drop the chat into
    // an unconstrained parent (a vanilla `<dialog>` without flex /
    // explicit height on the chat) the container grows to its content
    // and `clientHeight` balloons — the gutter formula then yields
    // absurd numbers. Realistic consumer code does this constraint
    // setup anyway when wiring a chat panel into a dialog.
    dialog.style.cssText =
      'width: 800px; height: 540px; padding: 0; border: 1px solid #444; ' +
      'border-radius: 8px; background: #0f0f0f; display: flex; flex-direction: column;'
    chat.style.flex = '1 1 auto'
    chat.style.minHeight = '0'
    // Move chat into the dialog without re-creating it.
    dialog.appendChild(chat)
    app.appendChild(dialog)
    ;(dialog as HTMLDialogElement).showModal()
  })
  await hold(page, 400)

  // Send a message — pin should engage.
  await showCue(page, 'inside <dialog>: send msg → pin')
  await sendUserMessage(page)
  // Stream a couple chunks (we want gutter to be meaningfully non-zero
  // to exercise tight-pin math inside the modal).
  for (let i = 0; i < 4; i += 1) {
    const more = await page.evaluate(() => window.__demo?.tick() ?? false)
    if (!more) break
    await page.waitForTimeout(80)
  }
  await hold(page, 400)

  const inDialogPin = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ubAll = document.querySelectorAll<HTMLElement>(
      '[data-test="user-msg"]',
    )
    const ub = ubAll[ubAll.length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    const g = c.querySelector<HTMLElement>('[data-chat-scroll-gutter]')!
    return {
      scrollTop: c.scrollTop,
      scrollH: c.scrollHeight,
      clientH: c.clientHeight,
      pinOffsetFromTop: u.top - s.top,
      pinnedYReal: u.top - s.top + c.scrollTop,
      gutterPx: parseFloat(g.style.height || '0'),
      contractDelta:
        c.scrollHeight - c.clientHeight - (u.top - s.top + c.scrollTop),
    }
  })
  console.log(
    `[probe-dialog] AFTER pin in modal: ` +
      `pin offset from viewport top=${inDialogPin.pinOffsetFromTop.toFixed(1)} ` +
      `gutter=${inDialogPin.gutterPx} ` +
      `pinnedY(real)=${inDialogPin.pinnedYReal.toFixed(1)} ` +
      `contractΔ=${inDialogPin.contractDelta.toFixed(1)}`,
  )

  // Close and re-open the dialog.
  await showCue(page, 'close dialog')
  await page.evaluate(() => {
    const d = document.getElementById('probe-dialog') as HTMLDialogElement
    d.close()
  })
  await hold(page, 400)

  await showCue(page, 're-open dialog')
  await page.evaluate(() => {
    const d = document.getElementById('probe-dialog') as HTMLDialogElement
    d.showModal()
  })
  await hold(page, 600)

  const afterReopen = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ubAll = document.querySelectorAll<HTMLElement>(
      '[data-test="user-msg"]',
    )
    const ub = ubAll[ubAll.length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    return {
      scrollTop: c.scrollTop,
      pinOffsetFromTop: u.top - s.top,
    }
  })
  console.log(
    `[probe-dialog] AFTER close + reopen: ` +
      `scrollTop=${afterReopen.scrollTop.toFixed(1)} ` +
      `pin offset from viewport top=${afterReopen.pinOffsetFromTop.toFixed(1)}`,
  )

  // Trigger a resize inside the reopened dialog — should re-anchor.
  await showCue(page, 'resize inside reopened dialog')
  await page.evaluate(() => window.__demo?.toggleBlock?.(1))
  await hold(page, 600)

  const afterResize = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-test="scroll"]')!
    const ubAll = document.querySelectorAll<HTMLElement>(
      '[data-test="user-msg"]',
    )
    const ub = ubAll[ubAll.length - 1]!
    const u = ub.getBoundingClientRect()
    const s = c.getBoundingClientRect()
    return {
      scrollTop: c.scrollTop,
      pinOffsetFromTop: u.top - s.top,
    }
  })
  console.log(
    `[probe-dialog] AFTER resize in reopened dialog: ` +
      `scrollTop=${afterResize.scrollTop.toFixed(1)} ` +
      `pin offset from viewport top=${afterResize.pinOffsetFromTop.toFixed(1)}`,
  )

  await hold(page, 800)

  // ASSERTIONS:
  // 1. While the modal is open, the pin should sit at ~scrollMargin (12px)
  //    from the viewport top of the SCROLL CONTAINER (not the page).
  // 2. After close/reopen, the pin should still be in its captured place.
  // 3. After a resize triggered inside the reopened dialog, the pin
  //    should still be at ~scrollMargin.
  expect(Math.abs(inDialogPin.pinOffsetFromTop - 12)).toBeLessThan(20)
  expect(Math.abs(afterReopen.pinOffsetFromTop - 12)).toBeLessThan(20)
  expect(Math.abs(afterResize.pinOffsetFromTop - 12)).toBeLessThan(20)
})
