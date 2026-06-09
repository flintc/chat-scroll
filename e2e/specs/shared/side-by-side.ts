import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
  streamUntilDone,
  userScrollSmooth,
} from '../../fixtures'

/**
 * Side-by-side strategy comparison: same canonical exchange streams
 * in both panels at the same time. Pin-to-top on the left,
 * stick-to-bottom on the right.
 *
 * On-screen cues (".cue" pill at the top of the chat) label each
 * user action so a viewer can connect what they're seeing to what's
 * happening. User scrolls are smooth so the motion is visible.
 */
export function sideBySideSpec(): void {
  test('side-by-side', async ({ page }) => {
    await page.goto('/#/side-by-side')
    await page.waitForFunction(() => Boolean(window.__demo))

    await hold(page, 2500) // opening still

    await showCue(page, 'user sends a question')
    await sendUserMessage(page)
    await hold(page, 1000)

    // Stream the canonical response in both panels simultaneously.
    await streamUntilDone(page, 150)

    await page.evaluate(() => window.__demo?.finishStream())
    await hold(page, 1500) // viewer compares: pin FAB visible, stick FAB hidden

    const fabStick = page.locator('[data-test="fab"]')
    const fabPin = page.locator('[data-test="fab-pin"]')
    await expect(fabPin).toHaveCSS('opacity', '1')
    await expect(fabStick).toHaveCSS('opacity', '0')

    // ─── Stick FAB demo ───────────────────────────────────────
    await showCue(page, 'user scrolls up (stick panel)')
    await userScrollSmooth(page, -350)
    await hold(page, 1500) // viewer sees stick FAB fade in

    await expect(fabStick).toHaveCSS('opacity', '1')

    await showCue(page, 'user clicks ↓ to re-lock')
    await fabStick.click()
    await hold(page, 1500)
    await expect(fabStick).toHaveCSS('opacity', '0')

    await hold(page, 800) // beat between FAB demos

    // ─── Pin FAB demo ─────────────────────────────────────────
    await showCue(page, 'user clicks ↓ on pin to see the tail')
    await fabPin.click()
    await hold(page, 1800) // viewer sees pin scroll down, FAB fade out

    await expect(fabPin).toHaveCSS('opacity', '0')

    await hold(page, 1200) // closing still
  })
}
