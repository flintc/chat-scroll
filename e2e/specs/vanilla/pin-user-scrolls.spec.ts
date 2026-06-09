import {
  test,
  expect,
  hold,
  sendUserMessage,
  showCue,
  streamN,
  userScrollSmooth,
} from '../../fixtures'

/**
 * Pin-to-top + user actively scrolls during streaming. Demonstrates:
 *  1. Scroll position is the user's during streaming.
 *  2. The gutter actively bounds scroll: trying to scroll past the
 *     last line lands on the gutter and stops there.
 *  3. Scrolling up to read history works freely while the bot keeps
 *     streaming below.
 */
test('pin-user-scrolls', async ({ page }) => {
  await page.goto('/#/pin-to-top')
  await page.waitForFunction(() => Boolean(window.__demo))

  await hold(page, 2200)

  await showCue(page, 'user sends a question — gutter visible below')
  await sendUserMessage(page)
  await page.waitForFunction(() =>
    document
      .querySelector('[data-test="status"]')
      ?.textContent?.includes('pinActive=✓'),
  )
  await hold(page, 800)

  await streamN(page, 18, 150)
  await hold(page, 800)

  await showCue(page, 'user scrolls down — gutter bounds the scroll')
  await userScrollSmooth(page, 250)
  await hold(page, 1200)
  await userScrollSmooth(page, 250)
  await hold(page, 1200)

  await streamN(page, 25, 150)
  await hold(page, 1200)

  await showCue(page, 'user scrolls up to read history')
  await userScrollSmooth(page, -300)
  await hold(page, 1200)
  await userScrollSmooth(page, -300)
  await hold(page, 1500)

  await page.evaluate(() => window.__demo?.finishStream())
  await hold(page, 1200)

  const status = await page.locator('[data-test="status"]').textContent()
  expect(status).toContain('pinActive=✓')
})
