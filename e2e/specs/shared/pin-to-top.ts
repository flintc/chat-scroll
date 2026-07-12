import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
  streamN,
  streamUntilDone,
} from '../../fixtures'

/**
 * Pin-to-top across multiple turns with expandable blocks (thinking
 * + tool calls). Two visible moments to watch in the recorded video:
 *
 *  1. **Turn-2 pin**: a fresh user message snaps to the top of the
 *     viewport, the response streams in below it.
 *  2. **Block toggle during streaming**: in the middle of turn-2,
 *     simulate the user expanding a thinking block from turn-1
 *     (above the pin). `overflow-anchor: none` is in force during
 *     streaming, so the browser will not auto-anchor for us — the
 *     controller must keep `pinnedY` honest and nudge `scrollTop` to
 *     match. Without that, the pinned message would drift down by
 *     the expanded block's height. With it, the pin stays put.
 */
export function pinToTopSpec(): void {
  test('pin-to-top', async ({ page }) => {
    page.on('console', (msg) => {
      const txt = msg.text()
      if (txt.startsWith('[pin-to-top]')) {
        console.log(txt)
      }
    })
    await page.goto('/#/pin-to-top')
    await page.waitForFunction(() => Boolean(window.__demo))

    await hold(page, 2000) // opening still

    // ─── Turn 1 ────────────────────────────────────────────────
    await showCue(page, 'user sends a question')
    await sendUserMessage(page)
    await hold(page, 600)

    await streamUntilDone(page, 130)
    await page.evaluate(() => window.__demo?.finishStream())

    await expect(page.locator('[data-test="status"]')).toContainText(
      'streaming=·',
    )
    await hold(page, 1300)

    const scrollBox1 = await page.locator('[data-test="scroll"]').boundingBox()
    const user1Box = await page
      .locator('[data-test="user-msg"]')
      .first()
      .boundingBox()
    expect(scrollBox1 && user1Box).toBeTruthy()
    if (scrollBox1 && user1Box) {
      expect(user1Box.y - scrollBox1.y).toBeLessThan(40)
    }

    // ─── Turn 2 — the visual moment ──────────────────────────
    await showCue(page, 'user sends a follow-up — watch it pin to top')
    await sendUserMessage(page)
    await hold(page, 900)

    const scrollBox2 = await page.locator('[data-test="scroll"]').boundingBox()
    const user2Box = await page
      .locator('[data-test="user-msg"]')
      .last()
      .boundingBox()
    if (scrollBox2 && user2Box) {
      expect(user2Box.y - scrollBox2.y).toBeLessThan(40)
    }

    // Stream halfway through turn-2 so the response is visibly in flight
    // when we toggle a prior block. `streaming: true` ⇒
    // `overflow-anchor: none` ⇒ browser won't auto-correct.
    await streamN(page, 6, 150)

    // ─── Toggle a prior thinking block mid-stream ────────────
    await showCue(page, 'user expands an earlier tool call (still streaming)')
    const user2BoxBefore = await page
      .locator('[data-test="user-msg"]')
      .last()
      .boundingBox()
    const scrollBoxBefore = await page
      .locator('[data-test="scroll"]')
      .boundingBox()

    // Block 1 is the (closed) tool-call block from turn-1's bot reply.
    await page.evaluate(() => window.__demo?.expandBlock?.(1))
    // Sample MID-animation. The CSS transition is 220ms; we check the
    // pin every 60ms across the animation. If the controller is lagging,
    // we'd see a brief drift before it settles.
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(60)
      const sb = await page.locator('[data-test="scroll"]').boundingBox()
      const ub = await page
        .locator('[data-test="user-msg"]')
        .last()
        .boundingBox()
      if (sb && ub) {
        const offset = ub.y - sb.y
        // The pin should sit within scrollMargin (~12) of the container top.
        // Allow generous tolerance because the cue toast may overlap.
        if (Math.abs(offset - 12) > 30) {
          console.log(
            `[pin-to-top] WARNING: drift during expand frame ${i}: offset=${offset.toFixed(1)}px`,
          )
        }
      }
    }
    await hold(page, 800)

    const user2BoxAfterExpand = await page
      .locator('[data-test="user-msg"]')
      .last()
      .boundingBox()
    const scrollBoxAfterExpand = await page
      .locator('[data-test="scroll"]')
      .boundingBox()
    if (
      scrollBoxBefore &&
      user2BoxBefore &&
      scrollBoxAfterExpand &&
      user2BoxAfterExpand
    ) {
      const dy =
        user2BoxAfterExpand.y -
        scrollBoxAfterExpand.y -
        (user2BoxBefore.y - scrollBoxBefore.y)
      console.log(
        `[pin-to-top] turn-2 user msg drift on mid-stream prior-tool expand: ${dy.toFixed(1)}px`,
      )
      // Pinned message should not drift more than a few px even though
      // overflow-anchor is none during streaming.
      expect(Math.abs(dy)).toBeLessThan(20)
    }

    await showCue(page, 'user collapses turn-1’s thinking block too')
    await page.evaluate(() => window.__demo?.collapseBlock?.(0))
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(60)
      const sb = await page.locator('[data-test="scroll"]').boundingBox()
      const ub = await page
        .locator('[data-test="user-msg"]')
        .last()
        .boundingBox()
      if (sb && ub) {
        const offset = ub.y - sb.y
        if (Math.abs(offset - 12) > 30) {
          console.log(
            `[pin-to-top] WARNING: drift during collapse frame ${i}: offset=${offset.toFixed(1)}px`,
          )
        }
      }
    }
    await hold(page, 800)

    const user2BoxAfterCollapse = await page
      .locator('[data-test="user-msg"]')
      .last()
      .boundingBox()
    const scrollBoxAfterCollapse = await page
      .locator('[data-test="scroll"]')
      .boundingBox()
    if (
      scrollBoxAfterExpand &&
      user2BoxAfterExpand &&
      scrollBoxAfterCollapse &&
      user2BoxAfterCollapse
    ) {
      const dy =
        user2BoxAfterCollapse.y -
        scrollBoxAfterCollapse.y -
        (user2BoxAfterExpand.y - scrollBoxAfterExpand.y)
      console.log(
        `[pin-to-top] turn-2 user msg drift on mid-stream prior-think collapse: ${dy.toFixed(1)}px`,
      )
      expect(Math.abs(dy)).toBeLessThan(20)
    }

    // ─── Toggle the in-turn thinking block (BELOW the pin) ──
    // The thinking block at index 2 lives in turn-2's bot reply,
    // below the pin. Collapsing/expanding here shrinks/grows
    // content below the pinned message; the pin should remain at
    // the top regardless. This is a different code path because
    // `refreshPinnedY` should yield ~0 delta (content above the
    // pin didn't change).
    await showCue(page, 'user toggles turn-2’s live thinking block')
    const user2BoxBeforeInTurn = await page
      .locator('[data-test="user-msg"]')
      .last()
      .boundingBox()
    const scrollBoxBeforeInTurn = await page
      .locator('[data-test="scroll"]')
      .boundingBox()
    await page.evaluate(() => window.__demo?.collapseBlock?.(2))
    await hold(page, 700)
    await page.evaluate(() => window.__demo?.expandBlock?.(2))
    await hold(page, 700)
    const user2BoxAfterInTurn = await page
      .locator('[data-test="user-msg"]')
      .last()
      .boundingBox()
    const scrollBoxAfterInTurn = await page
      .locator('[data-test="scroll"]')
      .boundingBox()
    if (
      scrollBoxBeforeInTurn &&
      user2BoxBeforeInTurn &&
      scrollBoxAfterInTurn &&
      user2BoxAfterInTurn
    ) {
      const dy =
        user2BoxAfterInTurn.y -
        scrollBoxAfterInTurn.y -
        (user2BoxBeforeInTurn.y - scrollBoxBeforeInTurn.y)
      console.log(
        `[pin-to-top] turn-2 user msg drift on in-turn block toggle: ${dy.toFixed(1)}px`,
      )
      expect(Math.abs(dy)).toBeLessThan(10)
    }

    // Finish streaming turn-2.
    await streamUntilDone(page, 130)
    await page.evaluate(() => window.__demo?.finishStream())
    await hold(page, 1200)

    await hold(page, 800)
  })
}
